const turf = require('@turf/turf')
import intersect from '@turf/intersect';

module.exports = function cut(poly, line, tolerance, toleranceType) {
    if (tolerance == null) {
        tolerance = 0.03;
    }
    if (toleranceType == null) {
        toleranceType = { units: 'meters' };
    }
    if (poly.geometry === void 0 || poly.geometry.type !== 'Polygon'){
        throw ('"turf-cut" only accepts Polygon type as victim input');
    }
    if (line.geometry === void 0 || (line.geometry.type !== 'LineString' && line.geometry.type !== 'Polygon' && line.geometry.type !== 'MultiLineString')){
        throw ('"turf-cut" only accepts LineString or polygon type as axe input');
    }
    if (line.geometry.type === "LineString") {
        if (turf.inside(turf.point(line.geometry.coordinates[0]), poly) || turf.inside(turf.point(line.geometry.coordinates[line.geometry.coordinates.length - 1]), poly)){
            throw ('Both first and last points of the polyline must be outside of the tract')
        }
    } else {
        let points = turf.explode(line)
        if (!turf.within(points, turf.featureCollection([poly]))){
            throw ('All points of polygon must be within tract.')
        }
    }

    var lineIntersect = turf.lineIntersect(line, poly)
    var lineExp = turf.explode(line)
    for (var p = 1; p < lineExp.features.length - 1; ++p) {
        lineIntersect.features.push(turf.point(lineExp.features[p].geometry.coordinates))
    }
    let _axe = (
        line.geometry.type === 'LineString'
        || line.geometry.type === 'MultiLineString')
        ? turf.buffer(line, tolerance, toleranceType)
        : line // turf-buffer issue #23
    let _body = turf.difference(poly, _axe)
    let inter = intersect(poly, _axe)

    let pieces1 = []
    let pieces2 = []
    let pieces3 = []

    if (_body.geometry.type === 'Polygon') {
        pieces1.push(turf.polygon(_body.geometry.coordinates))
        pieces3.push(turf.polygon(_body.geometry.coordinates))
    } else {
        _body.geometry.coordinates.forEach(function (a) {
            pieces1.push(turf.polygon(a))
            pieces3.push(turf.polygon(a))
        })
    }
    if (inter.geometry.type === 'Polygon') {
        pieces2.push(turf.polygon(inter.geometry.coordinates))
    } else {
        inter.geometry.coordinates.forEach(function (a) {
            pieces2.push(turf.polygon(a))
        })
    }

    console.log(pieces1)
    console.log(pieces2)
    for(let i in pieces2 ){
        for(let d in pieces1){
            if(intersect(pieces1[d],pieces2[i])){
                pieces3[d] = turf.union(pieces2[i], pieces1[d])
                break
            }
        }
    }
    // console.log(pieces)
    // console.log(_body)
    // console.log(inter)
    // pieces[0] = turf.union(pieces[0], inter)
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
    // for (let lp in lineIntersect.features) {
    //     let lpoint = lineIntersect.features[lp]
    //     for (let p in pieces) {
    //         let piece = pieces[p]
    //         for (let c in piece.geometry.coordinates[0]) {
    //             let coord = piece.geometry.coordinates[0][c]
    //             let p = turf.point(coord)
    //             if (turf.distance(lpoint, p, toleranceType) <= tolerance * 6) {
    //                 piece.geometry.coordinates[0][c] = lpoint.geometry.coordinates
    //             }
    //         }
    //     }
    // }
    //
    // // Filter out duplicate points
    // for (let p in pieces) {
    //     let newcoords = []
    //     let piece = pieces[p]
    //     for (let c in piece.geometry.coordinates[0]) {
    //         let coord = piece.geometry.coordinates[0][c]
    //         if (c == 0 || coord[0] != newcoords[newcoords.length - 1][0] || coord[1] != newcoords[newcoords.length - 1][1]) {
    //             newcoords.push(coord)
    //         }
    //     }
    //     piece.geometry.coordinates[0] = newcoords
    // }

    pieces3.forEach(function (a) {
        a.properties = poly.properties
    })

    return turf.featureCollection(pieces3)
}
