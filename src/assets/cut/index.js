import * as turf from 'turf/src/helpers';
import booleanPointInPolygon from 'turf/src/boolean-point-in-polygon';
import explode from 'turf/src/explode';
import lineIntersect from 'turf/src/line-intersect';
import difference from 'turf/src/difference';
import distance from 'turf/src/distance';
import buffer from 'turf/src/buffer';

module.exports = function cut(poly, line, tolerance, toleranceType) {
    if (tolerance == null) {
        tolerance = 0.005;
    }
    if (toleranceType == null) {
        toleranceType = { units: 'meters' };
    }
    if (poly.geometry === void 0 || poly.geometry.type !== 'Polygon') {
        throw ('"turf-cut" only accepts Polygon type as victim input');
    }
    if (line.geometry === void 0 || (line.geometry.type !== 'LineString' &&
            line.geometry.type !== 'Polygon' && line.geometry.type !== 'MultiLineString')) {
        throw ('"turf-cut" only accepts LineString or polygon type as axe input');
    }
    if (line.geometry.type === 'LineString') {
        if (booleanPointInPolygon(turf.point(line.geometry.coordinates[0]), poly, { ignoreBoundary: true }) ||
            booleanPointInPolygon(
                turf.point(line.geometry.coordinates[line.geometry.coordinates.length - 1]),
                poly,
                { ignoreBoundary: true },
            )) {
            throw ('Both first and last points of the polyline must be outside of the tract')
        }
    } else {
        let points = explode(line)
        if (!booleanPointInPolygon(points, turf.featureCollection([poly]), { ignoreBoundary: true })) {
            throw ('All points of polygon must be within tract.')
        }
    }
    var lineIntersected = lineIntersect(line, poly)
    var lineExp = explode(line)
    for (var p = 1; p < lineExp.features.length - 1; ++p) {
        lineIntersected.features.push(turf.point(lineExp.features[p].geometry.coordinates))
    }
    let _axe = (
        line.geometry.type === 'LineString'
        || line.geometry.type === 'MultiLineString')
        ? buffer(line, tolerance, toleranceType)
        : line // turf-buffer issue #23
    let _body = difference(poly, _axe)
    let pieces = []

    if (_body.geometry.type === 'Polygon') {
        pieces.push(turf.polygon(_body.geometry.coordinates))
    } else {
        _body.geometry.coordinates.forEach(function (a) {
            pieces.push(turf.polygon(a))
        })
    }

    // Zip the polygons back together
    // for (let p in pieces) {
    //     let piece = pieces[p]
    //     for (let c in piece.geometry.coordinates[0]) {
    //         let coord = piece.geometry.coordinates[0][c]
    //         let p = turf.point(coord)
    //         for (let lp in lineIntersect.features) {
    //             let lpoint = lineIntersect.features[lp]
    //             if (turf.distance(lpoint, p, toleranceType) <= tolerance * 6) {
    //                 piece.geometry.coordinates[0][c] = lpoint.geometry.coordinates
    //             }
    //         }
    //     }
    // }
    for (let lp in lineIntersected.features) {
        let lpoint = lineIntersected.features[lp]
        for (let p in pieces) {
            let piece = pieces[p]
            for (let c in piece.geometry.coordinates[0]) {
                let coord = piece.geometry.coordinates[0][c]
                let p = turf.point(coord)
                if (distance(lpoint, p, toleranceType) <= tolerance * 6) {
                    piece.geometry.coordinates[0][c] = lpoint.geometry.coordinates
                }
            }
        }
    }

    // Filter out duplicate points
    for (let p in pieces) {
        let newcoords = []
        let piece = pieces[p]
        for (let c in piece.geometry.coordinates[0]) {
            let coord = piece.geometry.coordinates[0][c]
            if (c == 0 || coord[0] != newcoords[newcoords.length - 1][0] || coord[1] != newcoords[newcoords.length - 1][1]) {
                newcoords.push(coord)
            }
        }
        piece.geometry.coordinates[0] = newcoords
    }

    pieces.forEach(function (a) {
        a.properties = poly.properties
    })

    return turf.featureCollection(pieces)
}
