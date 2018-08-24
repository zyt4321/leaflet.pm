import kinks from '@turf/kinks';
import get from 'lodash/get';
import Edit from './L.PM.Edit';
import Utils from '../L.PM.Utils';

// Shit's getting complicated in here with Multipolygon Support. So here's a quick note about it:
// Multipolygons with holes means lots of nested, multidimensional arrays.
// In order to find a value inside such an array you need a path to adress it directly.
// Example: var arr = [[['a', 'b'], ['c']]];
// The indexPath to 'b' is [0, 0, 1]. The indexPath to 'c' is [0, 1, 0].
// So I can get 'b' with: arr[0][0][1].
// Got it? Now you know what is meant when you read "indexPath" around here. Have fun 👍

Edit.Line = Edit.extend({
    initialize(layer) {
        this._layer = layer;
        this._enabled = false;
    },

    toggleEdit(options) {
        if (!this.enabled()) {
            this.enable(options);
        } else {
            this.disable();
        }
    },

    enable(options) {
        L.Util.setOptions(this, options);

        this._map = this._layer._map;

        // cancel when map isn't available, this happens when the polygon is removed before this fires
        if (!this._map) {
            return;
        }

        if (!this.enabled()) {
            // if it was already enabled, disable first
            // we don't block enabling again because new options might be passed
            this.disable();
        }

        // change state
        this._enabled = true;

        // init markers
        this._initMarkers();

        // if polygon gets removed from map, disable edit mode
        this._layer.on('remove', this._onLayerRemove, this);

        if (!this.options.allowSelfIntersection) {
            this._layer.on('pm:vertexremoved', this._handleSelfIntersectionOnVertexRemoval, this);
        }

        if (this.options.draggable) {
            this._initDraggableLayer();
        }

        if (!this.options.allowSelfIntersection) {
            this._handleLayerStyle();
        }
    },

    _onLayerRemove(e) {
        this.disable(e.target);
    },

    enabled() {
        return this._enabled;
    },

    disable(poly = this._layer) {
        // if it's not enabled, it doesn't need to be disabled
        if (!this.enabled()) {
            return false;
        }

        // prevent disabling if polygon is being dragged
        if (poly.pm._dragging) {
            return false;
        }
        poly.pm._enabled = false;
        poly.pm._markerGroup.clearLayers();

        // clean up draggable
        poly.off('mousedown');
        poly.off('mouseup');

        // remove onRemove listener
        this._layer.off('remove', this._onLayerRemove);

        if (!this.options.allowSelfIntersection) {
            this._layer.off('pm:vertexremoved', this._handleSelfIntersectionOnVertexRemoval);
        }

        // remove draggable class
        const el = poly._path ? poly._path : this._layer._renderer._container;
        L.DomUtil.removeClass(el, 'leaflet-pm-draggable');

        // remove invalid class if layer has self intersection
        if (this.hasSelfIntersection()) {
            L.DomUtil.removeClass(el, 'leaflet-pm-invalid');
        }

        if (this._layerEdited) {
            this._layer.fire('pm:update', {});
        }
        this._layerEdited = false;

        return true;
    },

    hasSelfIntersection() {
        // check for self intersection of the layer and return true/false
        const selfIntersection = kinks(this._layer.toGeoJSON(15));
        return selfIntersection.features.length > 0;
    },

    _handleSelfIntersectionOnVertexRemoval() {
        // check for selfintersection again (mainly to reset the style)
        this._handleLayerStyle(true);

        if (this.hasSelfIntersection()) {
            // reset coordinates
            this._layer.setLatLngs(this._coordsBeforeEdit);
            this._coordsBeforeEdit = null;

            // re-enable markers for the new coords
            this._initMarkers();
        }
    },

    _handleLayerStyle(flash) {
        const el = this._layer._path ? this._layer._path : this._layer._renderer._container;

        if (this.hasSelfIntersection()) {
            if (L.DomUtil.hasClass(el, 'leaflet-pm-invalid')) {
                return;
            }

            // if it does self-intersect, mark or flash it red
            if (flash) {
                L.DomUtil.addClass(el, 'leaflet-pm-invalid');
                window.setTimeout(() => {
                    L.DomUtil.removeClass(el, 'leaflet-pm-invalid');
                }, 200);
            } else {
                L.DomUtil.addClass(el, 'leaflet-pm-invalid');
            }

            // fire intersect event
            this._layer.fire('pm:intersect', {
                intersection: kinks(this._layer.toGeoJSON(15)),
            });
        } else {
            // if not, reset the style to the default color
            L.DomUtil.removeClass(el, 'leaflet-pm-invalid');
        }
    },

    _initMarkers() {
        const map = this._map;
        const coords = this._layer.getLatLngs();

        // cleanup old ones first
        if (this._markerGroup) {
            this._markerGroup.clearLayers();
        }

        // add markerGroup to map, markerGroup includes regular and middle markers
        this._markerGroup = new L.LayerGroup();
        this._markerGroup._pmTempLayer = true;
        map.addLayer(this._markerGroup);

        // handle coord-rings (outer, inner, etc)
        const handleRing = (coordsArr) => {
            // if there is another coords ring, go a level deep and do this again
            if (Array.isArray(coordsArr[0])) {
                return coordsArr.map(handleRing, this);
            }

            // the marker array, it includes only the markers of vertexes (no middle markers)
            const ringArr = coordsArr.map(this._createMarker, this);

            // create small markers in the middle of the regular markers
            coordsArr.map((v, k) => {
                // find the next index fist
                const nextIndex = this.isPolygon() ? (k + 1) % coordsArr.length : k + 1;
                // create the marker
                return this._createMiddleMarker(ringArr[k], ringArr[nextIndex]);
            });

            return ringArr;
        };

        // create markers
        this._markers = handleRing(coords);

        if (this.options.snappable) {
            this._initSnappableMarkers();
        }
    },

    // creates initial markers for coordinates
    _createMarker(latlng) {
        const marker = new L.Marker(latlng, {
            draggable: !this.options.preventVertexEdit,
            icon: L.divIcon({ className: 'marker-icon' }),
        });

        marker._pmTempLayer = true;

        marker.on('dragstart', this._onMarkerDragStart, this);
        marker.on('move', this._onMarkerDrag, this);
        marker.on('dragend', this._onMarkerDragEnd, this);

        if (!this.options.preventMarkerRemoval) {
            marker.on('contextmenu', this._removeMarker, this);
        }

        this._markerGroup.addLayer(marker);

        return marker;
    },

    // creates the middle markes between coordinates
    _createMiddleMarker(leftM, rightM) {
        // cancel if there are no two markers
        if (!leftM || !rightM) {
            return false;
        }

        const latlng = Utils.calcMiddleLatLng(this._map, leftM.getLatLng(), rightM.getLatLng());

        const middleMarker = this._createMarker(latlng);
        const middleIcon = L.divIcon({ className: 'marker-icon marker-icon-middle' });
        middleMarker.setIcon(middleIcon);

        // save reference to this middle markers on the neighboor regular markers
        leftM._middleMarkerNext = middleMarker;
        rightM._middleMarkerPrev = middleMarker;

        middleMarker.on('click', () => {
            // TODO: move the next two lines inside _addMarker() as soon as
            // https://github.com/Leaflet/Leaflet/issues/4484
            // is fixed
            const icon = L.divIcon({ className: 'marker-icon' });
            middleMarker.setIcon(icon);

            this._addMarker(middleMarker, leftM, rightM);
        });
        middleMarker.on('movestart', () => {
            // TODO: This is a workaround. Remove the moveend listener and
            // callback as soon as this is fixed:
            // https://github.com/Leaflet/Leaflet/issues/4484
            middleMarker.on('moveend', () => {
                const icon = L.divIcon({ className: 'marker-icon' });
                middleMarker.setIcon(icon);

                middleMarker.off('moveend');
            });

            this._addMarker(middleMarker, leftM, rightM);
        });

        return middleMarker;
    },

    // adds a new marker from a middlemarker
    _addMarker(newM, leftM, rightM) {
        // first, make this middlemarker a regular marker
        newM.off('movestart');
        newM.off('click');

        // now, create the polygon coordinate point for that marker
        // and push into marker array
        // and associate polygon coordinate with marker coordinate
        const latlng = newM.getLatLng();
        const coords = this._layer._latlngs;

        // the index path to the marker inside the multidimensional marker array
        const { indexPath, index, parentPath } = this.findDeepMarkerIndex(this._markers, leftM);

        // define the coordsRing that is edited
        const coordsRing = indexPath.length > 1 ? get(coords, parentPath) : coords;

        // define the markers array that is edited
        const markerArr = indexPath.length > 1 ? get(this._markers, parentPath) : this._markers;

        // add coordinate to coordinate array
        coordsRing.splice(index + 1, 0, latlng);

        // add marker to marker array
        markerArr.splice(index + 1, 0, newM);

        // set new latlngs to update polygon
        this._layer.setLatLngs(coords);

        // create the new middlemarkers
        this._createMiddleMarker(leftM, newM);
        this._createMiddleMarker(newM, rightM);

        // fire edit event
        this._fireEdit();

        this._layer.fire('pm:vertexadded', {
            layer: this._layer,
            marker: newM,
            indexPath: this.findDeepMarkerIndex(this._markers, newM).indexPath,
            latlng,
            // TODO: maybe add latlng as well?
        });

        if (this.options.snappable) {
            this._initSnappableMarkers();
        }
    },

    // _removeMarker(e)
    _removeMarker(e, isDrawing) {
        // if self intersection isn't allowed, save the coords upon dragstart
        // in case we need to reset the layer
        if (!this.options.allowSelfIntersection) {
            const c = this._layer.getLatLngs();
            this._coordsBeforeEdit = JSON.parse(JSON.stringify(c));
        }

        // the marker that should be removed
        const marker = e.target;

        // coords of the layer
        let coords = this._layer.getLatLngs();

        // the index path to the marker inside the multidimensional marker array
        const { indexPath, index, parentPath } = this.findDeepMarkerIndex(this._markers, marker);

        // only continue if this is NOT a middle marker (those can't be deleted)
        if (!indexPath) {
            return;
        }

        // define the coordsRing that is edited
        const coordsRing = indexPath.length > 1 ? get(coords, parentPath) : coords;

        // define the markers array that is edited
        const markerArr = indexPath.length > 1 ? get(this._markers, parentPath) : this._markers;

        // remove coordinate
        coordsRing.splice(index, 1);

        // set new latlngs to the polygon
        this._layer.setLatLngs(coords);

        // if the ring of the poly has no coordinates left, remove the last coord too
        if (coordsRing.length <= 1 && !isDrawing) {
            coordsRing.splice(0, coordsRing.length);

            // !!!add 180823
            if(typeof coords[0] === typeof [] && typeof coords[0][0] === typeof [] &&
                typeof coords[0][0][0] === typeof []) {
                for(let poly of coords) {
                    poly = poly.filter(ring => ring.length > 2 && ![null, '', undefined].includes(ring[0]));
                }
            }else {
                coords = coords.filter(ring => ring.length > 2 && ![null, '', undefined].includes(ring[0]));
            }
            // set new coords
            this._layer.setLatLngs(coords);

            // re-enable editing so unnecessary markers are removed
            // TODO: kind of an ugly workaround maybe do it better?
            this.disable();
            this.enable(this.options);
        }

        // TODO: we may should remove all empty coord-rings here as well.


        // if no coords are left, remove the layer
        if (this.isEmptyDeep(coords) && !isDrawing) {
            this._layer.remove();
        }

        // now handle the middle markers
        // remove the marker and the middlemarkers next to it from the map
        if (marker._middleMarkerPrev) {
            this._markerGroup.removeLayer(marker._middleMarkerPrev);
        }
        if (marker._middleMarkerNext) {
            this._markerGroup.removeLayer(marker._middleMarkerNext);
        }

        // remove the marker from the map
        this._markerGroup.removeLayer(marker);

        let rightMarkerIndex;
        let leftMarkerIndex;

        if (this.isPolygon()) {
            // find neighbor marker-indexes
            rightMarkerIndex = (index + 1) % markerArr.length;
            leftMarkerIndex = (index + (markerArr.length - 1)) % markerArr.length;
        } else {
            // find neighbor marker-indexes
            leftMarkerIndex = index - 1 < 0 ? undefined : index - 1;
            rightMarkerIndex = index + 1 >= markerArr.length ? undefined : index + 1;
        }

        // don't create middlemarkers if there is only one marker left
        if (rightMarkerIndex !== leftMarkerIndex) {
            const leftM = markerArr[leftMarkerIndex];
            const rightM = markerArr[rightMarkerIndex];
            this._createMiddleMarker(leftM, rightM);
        }

        // remove the marker from the markers array
        markerArr.splice(index, 1);

        // fire edit event
        this._fireEdit();

        // fire vertex removal event
        this._layer.fire('pm:vertexremoved', {
            layer: this._layer,
            marker,
            indexPath,
            // TODO: maybe add latlng as well?
        });
    },
    isEmptyDeep(l) {
        // thanks for the function, Felix Heck
        const flatten = list =>
            list.filter(x => ![null, '', undefined].includes(x)).reduce((a, b) => a.concat(Array.isArray(b) ? flatten(b) : b), []);

        return !flatten(l).length;
    },
    findDeepMarkerIndex(arr, marker) {
        // thanks for the function, Felix Heck
        let result;

        const run = path => (v, i) => {
            const iRes = path.concat(i);

            if (v._leaflet_id === marker._leaflet_id) {
                result = iRes;
                return true;
            }

            return Array.isArray(v) && v.some(run(iRes));
        };
        arr.some(run([]));

        let returnVal = {};

        if (result) {
            returnVal = {
                indexPath: result,
                index: result[result.length - 1],
                parentPath: result.slice(0, result.length - 1),
            };
        }

        return returnVal;
    },
    updatePolygonCoordsFromMarkerDrag(marker) {
        // update polygon coords
        const coords = this._layer.getLatLngs();

        // get marker latlng
        const latlng = marker.getLatLng();

        // get indexPath of Marker
        const { indexPath, index, parentPath } = this.findDeepMarkerIndex(this._markers, marker);

        // update coord
        const parent = indexPath.length > 1 ? get(coords, parentPath) : coords;
        parent.splice(index, 1, latlng);

        // set new coords on layer
        this._layer.setLatLngs(coords).redraw();
    },

    _onMarkerDrag(e) {
        // dragged marker
        const marker = e.target;

        const { indexPath, index, parentPath } = this.findDeepMarkerIndex(this._markers, marker);

        // only continue if this is NOT a middle marker
        if (!indexPath) {
            return;
        }

        this.updatePolygonCoordsFromMarkerDrag(marker);

        // the dragged markers neighbors
        const markerArr = indexPath.length > 1 ? get(this._markers, parentPath) : this._markers;

        // find the indizes of next and previous markers
        const nextMarkerIndex = (index + 1) % markerArr.length;
        const prevMarkerIndex = (index + (markerArr.length - 1)) % markerArr.length;

        // update middle markers on the left and right
        // be aware that "next" and "prev" might be interchanged, depending on the geojson array
        const markerLatLng = marker.getLatLng();

        // get latlng of prev and next marker
        const prevMarkerLatLng = markerArr[prevMarkerIndex].getLatLng();
        const nextMarkerLatLng = markerArr[nextMarkerIndex].getLatLng();

        if (marker._middleMarkerNext) {
            const middleMarkerNextLatLng = Utils.calcMiddleLatLng(this._map, markerLatLng, nextMarkerLatLng);
            marker._middleMarkerNext.setLatLng(middleMarkerNextLatLng);
        }

        if (marker._middleMarkerPrev) {
            const middleMarkerPrevLatLng = Utils.calcMiddleLatLng(this._map, markerLatLng, prevMarkerLatLng);
            marker._middleMarkerPrev.setLatLng(middleMarkerPrevLatLng);
        }

        // if self intersection is not allowed, handle it
        if (!this.options.allowSelfIntersection) {
            this._handleLayerStyle();
        }
    },

    _onMarkerDragEnd(e) {
        const marker = e.target;
        const { indexPath } = this.findDeepMarkerIndex(this._markers, marker);

        // if self intersection is not allowed but this edit caused a self intersection,
        // reset and cancel; do not fire events
        if (!this.options.allowSelfIntersection && this.hasSelfIntersection()) {
            // reset coordinates
            this._layer.setLatLngs(this._coordsBeforeEdit);
            this._coordsBeforeEdit = null;

            // re-enable markers for the new coords
            this._initMarkers();

            // check for selfintersection again (mainly to reset the style)
            this._handleLayerStyle();
            return;
        }

        this._layer.fire('pm:markerdragend', {
            markerEvent: e,
            indexPath,
        });

        // fire edit event
        this._fireEdit();
    },
    _onMarkerDragStart(e) {
        const marker = e.target;
        const { indexPath } = this.findDeepMarkerIndex(this._markers, marker);

        this._layer.fire('pm:markerdragstart', {
            markerEvent: e,
            indexPath,
        });

        // if self intersection isn't allowed, save the coords upon dragstart
        // in case we need to reset the layer
        if (!this.options.allowSelfIntersection) {
            this._coordsBeforeEdit = this._layer.getLatLngs();
        }
    },

    _fireEdit() {
        // fire edit event
        this._layerEdited = true;
        this._layer.fire('pm:edit');
    },
    removeLastVertex(isDrawing) {
        let wasRemoved = false;
        const layer = this._layer;
        if (layer && layer.pm && layer._map) {
            layer.pm.enable();
            const markers = layer.pm._markers;
            if (markers.length > 0) {
                const marker = markers[markers.length - 1];
                this._removeMarker({ target: marker }, isDrawing);
                wasRemoved = true;
            }
            layer.pm.disable();
        }
        return wasRemoved;
    },
});
