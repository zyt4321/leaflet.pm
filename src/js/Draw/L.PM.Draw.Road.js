import lineOffset from 'turf/src/line-offset';
import booleanClockwise from 'turf/src/boolean-clockwise';
import { lineString } from 'turf/src/helpers';
import difference from 'turf/src/difference';
import intersect from 'turf/src/intersect';
import Draw from './L.PM.Draw';


Draw.Road = Draw.Line.extend({
    initialize(map) {
        this._map = map;
        this._shape = 'Road';
        this.toolbarButtonName = 'drawRoad';
    },
    _cut(layer) {
        const all = this._map._layers;

        // find all layers that intersect with `layer`, the just drawn cutting layer
        const layers = Object.keys(all)
        // convert object to array
            .map(l => all[l])
            // only layers handled by leaflet.pm
            .filter(l => l.pm)
            // only polygons
            .filter(l => l instanceof L.Polygon)
            // exclude the drawn one
            .filter(l => l !== layer)
            // only layers with intersections
            .filter((l) => {
                try {
                    return !!intersect(layer.toGeoJSON(12), l.toGeoJSON(12));
                } catch (e) {
                    // console.error('You cant cut polygons with self-intersections');
                    return false;
                }
            });


        // loop through all layers that intersect with the drawn (cutting) layer
        layers.forEach((l) => {
            try {
                // 用layer切l，获得l的剩余部分
                const diff = difference(l.toGeoJSON(12), layer.toGeoJSON(12));
                // 求layer与l的公共部分
                const intersection = intersect(l.toGeoJSON(12), layer.toGeoJSON(12));
                // 若得到的是multipolygon，则转换为单独的polygon
                const featureCollection = { features: [], type: 'FeatureCollection' };
                const geom1 = diff.geometry;
                const props1 = diff.properties;
                if(geom1.type === 'MultiPolygon') {
                    for (let i = 0; i < geom1.coordinates.length; i++) {
                        const feature = {
                            geometry: {
                                type: 'Polygon',
                                coordinates: geom1.coordinates[i],
                            },
                            properties: props1,
                            type: 'Feature',
                            _temp: 'diff',
                        };
                        featureCollection.features.push(feature);
                    }
                }else if(geom1.type === 'Polygon') {
                    geom1._temp = 'diff';
                    featureCollection.features.push(diff);
                }

                const geom2 = intersection.geometry;
                const props2 = intersection.properties;
                if(geom2.type === 'MultiPolygon') {
                    for (let i = 0; i < geom2.coordinates.length; i++) {
                        const feature = {
                            geometry: {
                                type: 'Polygon',
                                coordinates: geom2.coordinates[i],
                            },
                            properties: props2,
                            type: 'Feature',
                            _temp: 'intersect',
                        };
                        featureCollection.features.push(feature);
                    }
                }else if(geom2.type === 'Polygon') {
                    geom2._temp = 'intersect';
                    featureCollection.features.push(intersection);
                }
                // the resulting layers after the cut
                const resultingLayersDiff = [];
                const resultingLayersIntersect = [];
                // add new layer to map
                for(const geo of featureCollection.features) {
                    const polygonLayer = L.polygon(
                        L.GeoJSON.coordsToLatLngs(geo.geometry.coordinates, 1),
                        this.options.pathOptions,
                    ).addTo(this._map);
                    if (geo._temp === 'diff') {
                        resultingLayersDiff.push(polygonLayer);
                    }else if(geo._temp === 'intersect') {
                        resultingLayersIntersect.push(polygonLayer);
                    }
                }
                // fire pm:cut on the cutted layer
                l.fire('pm:cut', {
                    shape: this._shape,
                    cuttedLayer: l,
                    resultingLayersDiff,
                    resultingLayersIntersect,
                });

                // fire pm:cut on the map for each cutted layer
                this._map.fire('pm:cut', {
                    shape: this._shape,
                    cuttedLayer: l,
                    resultingLayersDiff,
                    resultingLayersIntersect,
                });
                // add templayer prop so pm:remove isn't fired
                l._pmTempLayer = true;
                layer._pmTempLayer = true;

                // remove old layer and cutting layer
                l.remove();
                layer.remove();
            } catch (e) {
                // console.error('You cant cut polygons with self-intersections');
                // console.log(e)
            }

        });
    },
    _finishShape(event) {
        // if self intersection is not allowed, do not finish the shape!
        if (!this.options.allowSelfIntersection && this._doesSelfIntersect) {
            return;
        }

        // get coordinates, create the leaflet shape and add it to the map
        const coords = this._layer.getLatLngs();
        if (event && event.type === 'dblclick') {
            // Leaflet creates an extra node with double click
            coords.splice(coords.length - 1, 1);
        }
        // 双击第一个点结束绘制时，会生成一个顶点数为0的空多边形，要删除
        // 只有两两个点的多边形没有意义，删除
        if(coords.length <= 2) {
            // disable drawing
            this.disable();
            // clean up snapping states
            this._cleanupSnapping();
            // remove the first vertex from "other snapping layers"
            this._otherSnapLayers.splice(this._tempSnapLayerIndex, 1);
            delete this._tempSnapLayerIndex;

            if(this.options.forever){
                this.enable(this.options)
            }
            return;
        }
        // 计算第1、2点的距离
        const lineWidth = coords[0].distanceTo(coords[1]);
        // 转换格式
        const arrayCoords = coords.map((coord) => {
            return [coord.lng, coord.lat];
        });
        // 计算是否为顺时针
        const temp = []
        temp.push(arrayCoords[0],arrayCoords[1],arrayCoords[2],arrayCoords[0]);
        const isClockwise = booleanClockwise(lineString(temp));
        // 除去第一个点，得到一边
        const originLine = arrayCoords.slice(1);
        // 计算另一边，并反向
        const offsetLine = lineOffset(lineString(originLine), isClockwise ? -lineWidth : lineWidth, { units: 'meters' }).geometry.coordinates.reverse();
        // 两边合并
        const mergeLine = originLine.concat(offsetLine);
        // 转换格式
        const mergeCoods = mergeLine.map((coord) => {
            return { lat: coord[1], lng: coord[0] };
        });
        // 画多边形
        const polygonLayer = L.polygon(mergeCoods, this.options.pathOptions)

        // 裁剪
        this._cut(polygonLayer);

        // disable drawing
        this.disable();

        // // fire the pm:create event and pass shape and layer
        // this._map.fire('pm:create', {
        //     shape: this._shape,
        //     layer: polygonLayer,
        // });

        // clean up snapping states
        this._cleanupSnapping();

        // remove the first vertex from "other snapping layers"
        this._otherSnapLayers.splice(this._tempSnapLayerIndex, 1);
        delete this._tempSnapLayerIndex;

        if(this.options.forever){
            this.enable(this.options)
        }
    },
    _createMarker(latlng, first) {
        // create the new marker
        const marker = new L.Marker(latlng, {
            draggable: false,
            icon: L.divIcon({ className: 'marker-icon' }),
        });

        // mark this marker as temporary
        marker._pmTempLayer = true;

        // add it to the map
        this._layerGroup.addLayer(marker);

        // // if the first marker gets clicked again, finish this shape
        // if (first) {
        //     marker.on('click', this._finishShape, this);
        //
        //     // add the first vertex to "other snapping layers" so the polygon is easier to finish
        //     this._tempSnapLayerIndex = this._otherSnapLayers.push(marker) - 1;
        //
        //     if (this.options.snappable) {
        //         this._cleanupSnapping();
        //     }
        // }

        // a click on any marker finishes this shape
        marker.on('click', this._finishShape, this);

        return marker;
    },
});
