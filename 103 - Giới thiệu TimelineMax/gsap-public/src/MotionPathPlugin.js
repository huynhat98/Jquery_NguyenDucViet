/*!
 * MotionPathPlugin 3.4.1
 * https://greensock.com
 *
 * @license Copyright 2008-2020, GreenSock. All rights reserved.
 * Subject to the terms at https://greensock.com/standard-license or for
 * Club GreenSock members, the agreement issued with that membership.
 * @author: Jack Doyle, jack@greensock.com
*/
/* eslint-disable */

import { getRawPath, cacheRawPathMeasurements, getPositionOnPath, pointsToSegment, flatPointsToSegment, sliceRawPath, stringToRawPath, rawPathToString, transformRawPath, convertToPath } from "./utils/paths.js";
import { getGlobalMatrix } from "./utils/matrix.js";

let _xProps = ["x","translateX","left","marginLeft"],
	_yProps = ["y","translateY","top","marginTop"],
	_DEG2RAD = Math.PI / 180,
	gsap, PropTween, _getUnit, _toArray,
	_getGSAP = () => gsap || (typeof(window) !== "undefined" && (gsap = window.gsap) && gsap.registerPlugin && gsap),
	_populateSegmentFromArray = (segment, values, property, mode) => { //mode: 0 = x but don't fill y yet, 1 = y, 2 = x and fill y with 0.
		let l = values.length,
			si = mode === 2 ? 0 : mode,
			i = 0;
		for (; i < l; i++) {
			segment[si] = parseFloat(values[i][property]);
			mode === 2 && (segment[si+1] = 0);
			si += 2;
		}
		return segment;
	},
	_getPropNum = (target, prop, unit) => parseFloat(target._gsap.get(target, prop, unit || "px")) || 0,
	_relativize = segment => {
		let x = segment[0],
			y = segment[1],
			i;
		for (i = 2; i < segment.length; i+=2) {
			x = (segment[i] += x);
			y = (segment[i+1] += y);
		}
	},
	_segmentToRawPath = (plugin, segment, target, x, y, slicer, vars) => {
		if (vars.type === "cubic") {
			segment = [segment];
		} else {
			segment.unshift(_getPropNum(target, x, vars.unitX), y ? _getPropNum(target, y, vars.unitY) : 0);
			vars.relative && _relativize(segment);
			let pointFunc = y ? pointsToSegment : flatPointsToSegment;
			segment = [pointFunc(segment, vars.curviness)];
		}
		segment = slicer(_align(segment, target, vars));
		_addDimensionalPropTween(plugin, target, x, segment, "x", vars.unitX);
		y && _addDimensionalPropTween(plugin, target, y, segment, "y", vars.unitY);
		return cacheRawPathMeasurements(segment, vars.resolution || (vars.curviness === 0 ? 20 : 12)); //when curviness is 0, it creates control points right on top of the anchors which makes it more sensitive to resolution, thus we change the default accordingly.
	},
	_emptyFunc = v => v,
	_numExp = /[-+\.]*\d+[\.e\-\+]*\d*[e\-\+]*\d*/g,
	_originToPoint = (element, origin, parentMatrix) => { // origin is an array of normalized values (0-1) in relation to the width/height, so [0.5, 0.5] would be the center. It can also be "auto" in which case it will be the top left unless it's a <path>, when it will start at the beginning of the path itself.
		let m = getGlobalMatrix(element),
			svg, x, y;
		if ((element.tagName + "").toLowerCase() === "svg") {
			svg = element.viewBox.baseVal;
			x = svg.x;
			y = svg.y;
			svg.width || (svg = {width: +element.getAttribute("width"), height: +element.getAttribute("height")});
		} else {
			svg = origin && element.getBBox && element.getBBox();
			x = y = 0;
		}
		if (origin && origin !== "auto") {
			x += origin.push ? origin[0] * (svg ? svg.width : element.offsetWidth || 0) : origin.x;
			y += origin.push ? origin[1] * (svg ? svg.height : element.offsetHeight || 0) : origin.y;
		}
		return parentMatrix.apply( x || y ? m.apply({x: x, y: y}) : {x: m.e, y: m.f} );
	},
	_getAlignMatrix = (fromElement, toElement, fromOrigin, toOrigin) => {
		let parentMatrix = getGlobalMatrix(fromElement.parentNode, true, true),
			m = parentMatrix.clone().multiply(getGlobalMatrix(toElement)),
			fromPoint = _originToPoint(fromElement, fromOrigin, parentMatrix),
			{x, y} = _originToPoint(toElement, toOrigin, parentMatrix),
			p;
		m.e = m.f = 0;
		if (toOrigin === "auto" && toElement.getTotalLength && toElement.tagName.toLowerCase() === "path") {
			p = toElement.getAttribute("d").match(_numExp) || [];
			p = m.apply({x:+p[0], y:+p[1]});
			x += p.x;
			y += p.y;
		}
		if (p || (toElement.getBBox && fromElement.getBBox && toElement.ownerSVGElement === fromElement.ownerSVGElement)) {
			p = m.apply(toElement.getBBox());
			x -= p.x;
			y -= p.y;
		}
		m.e = x - fromPoint.x;
		m.f = y - fromPoint.y;
		return m;
	},
	_align = (rawPath, target, {align, matrix, offsetX, offsetY, alignOrigin}) => {
		let x = rawPath[0][0],
			y = rawPath[0][1],
			curX = _getPropNum(target, "x"),
			curY = _getPropNum(target, "y"),
			alignTarget, m, p;
		if (!rawPath || !rawPath.length) {
			return getRawPath("M0,0L0,0");
		}
		if (align) {
			if (align === "self" || ((alignTarget = _toArray(align)[0] || target) === target)) {
				transformRawPath(rawPath, 1, 0, 0, 1, curX - x, curY - y);
			} else {
				if (alignOrigin && alignOrigin[2] !== false) {
					gsap.set(target, {transformOrigin:(alignOrigin[0] * 100) + "% " + (alignOrigin[1] * 100) + "%"});
				} else {
					alignOrigin = [_getPropNum(target, "xPercent") / -100, _getPropNum(target, "yPercent") / -100];
				}
				m = _getAlignMatrix(target, alignTarget, alignOrigin, "auto");
				p = m.apply({x: x, y: y});
				transformRawPath(rawPath, m.a, m.b, m.c, m.d, curX + m.e - (p.x - m.e), curY + m.f - (p.y - m.f));
			}
		}
		if (matrix) {
			transformRawPath(rawPath, matrix.a, matrix.b, matrix.c, matrix.d, matrix.e, matrix.f);
		} else if (offsetX || offsetY) {
			transformRawPath(rawPath, 1, 0, 0, 1, offsetX || 0, offsetY || 0);
		}
		return rawPath;
	},
	_addDimensionalPropTween = (plugin, target, property, rawPath, pathProperty, forceUnit) => {
		let cache = target._gsap,
			harness = cache.harness,
			alias = (harness && harness.aliases && harness.aliases[property]),
			prop = alias && alias.indexOf(",") < 0 ? alias : property,
			pt = plugin._pt = new PropTween(plugin._pt, target, prop, 0, 0, _emptyFunc, 0, cache.set(target, prop, plugin));
		pt.u = _getUnit(cache.get(target, prop, forceUnit)) || 0;
		pt.path = rawPath;
		pt.pp = pathProperty;
		plugin._props.push(prop);
	},
	_sliceModifier = (start, end) => rawPath => (start || end !== 1) ? sliceRawPath(rawPath, start, end) : rawPath;


export const MotionPathPlugin = {
	version: "3.4.1",
	name: "motionPath",
	register(core, Plugin, propTween) {
		gsap = core;
		_getUnit = gsap.utils.getUnit;
		_toArray = gsap.utils.toArray;
		PropTween = propTween;
	},
	init(target, vars) {
		if (!gsap) {
			console.warn("Please gsap.registerPlugin(MotionPathPlugin)");
			return false;
		}
		if (!(typeof(vars) === "object" && !vars.style) || !vars.path) {
			vars = {path:vars};
		}
		let rawPaths = [],
			path = vars.path,
			firstObj = path[0],
			autoRotate = vars.autoRotate,
			slicer = _sliceModifier(vars.start, ("end" in vars) ? vars.end : 1),
			rawPath, p, x, y;
		this.rawPaths = rawPaths;
		this.target = target;
		if ((this.rotate = (autoRotate || autoRotate === 0))) { //get the rotational data FIRST so that the setTransform() method is called in the correct order in the render() loop - rotation gets set last.
			this.rOffset = parseFloat(autoRotate) || 0;
			this.radians = !!vars.useRadians;
			this.rProp = vars.rotation || "rotation";                       // rotation property
			this.rSet = target._gsap.set(target, this.rProp, this);         // rotation setter
			this.ru = _getUnit(target._gsap.get(target, this.rProp)) || 0;  // rotation units
		}
		if (Array.isArray(path) && !("closed" in path) && typeof(firstObj) !== "number") {
			for (p in firstObj) {
				if (~_xProps.indexOf(p)) {
					x = p;
				} else if (~_yProps.indexOf(p)) {
					y = p;
				}
			}
			if (x && y) { //correlated values
				rawPaths.push(_segmentToRawPath(this, _populateSegmentFromArray(_populateSegmentFromArray([], path, x, 0), path, y, 1), target, vars.x || x, vars.y || y, slicer, vars));
			} else {
				x = y = 0;
			}
			for (p in firstObj) {
				if (p !== x && p !== y) {
					rawPaths.push(_segmentToRawPath(this, _populateSegmentFromArray([], path, p, 2), target, p, 0, slicer, vars));
				}
			}
		} else {
			rawPath = slicer(_align(getRawPath(vars.path), target, vars));
			cacheRawPathMeasurements(rawPath, vars.resolution);
			rawPaths.push(rawPath);
			_addDimensionalPropTween(this, target, vars.x || "x", rawPath, "x", vars.unitX || "px");
			_addDimensionalPropTween(this, target, vars.y || "y", rawPath, "y", vars.unitY || "px");
		}
	},
	render(ratio, data) {
		let rawPaths = data.rawPaths,
			i = rawPaths.length,
			pt = data._pt;
		if (ratio > 1) {
			ratio = 1;
		} else if (ratio < 0) {
			ratio = 0;
		}
		while (i--) {
			getPositionOnPath(rawPaths[i], ratio, !i && data.rotate, rawPaths[i]);
		}
		while (pt) {
			pt.set(pt.t, pt.p, pt.path[pt.pp] + pt.u, pt.d, ratio);
			pt = pt._next;
		}
		data.rotate && data.rSet(data.target, data.rProp, rawPaths[0].angle * (data.radians ? _DEG2RAD : 1) + data.rOffset + data.ru, data, ratio);
	},
	getLength(path) {
		return cacheRawPathMeasurements(getRawPath(path)).totalLength;
	},
	sliceRawPath,
	getRawPath,
	pointsToSegment,
	stringToRawPath,
	rawPathToString,
	transformRawPath,
	getGlobalMatrix,
	getPositionOnPath,
	cacheRawPathMeasurements,
	convertToPath: (targets, swap) => _toArray(targets).map(target => convertToPath(target, swap !== false)),
	convertCoordinates(fromElement, toElement, point) {
		let m = getGlobalMatrix(toElement, true, true).multiply(getGlobalMatrix(fromElement));
		return point ? m.apply(point) : m;
	},
	getAlignMatrix: _getAlignMatrix,
	getRelativePosition(fromElement, toElement, fromOrigin, toOrigin) {
		let m =_getAlignMatrix(fromElement, toElement, fromOrigin, toOrigin);
		return {x: m.e, y: m.f};
	},
	arrayToRawPath(value, vars) {
		vars = vars || {};
		let segment = _populateSegmentFromArray(_populateSegmentFromArray([], value, vars.x || "x", 0), value, vars.y || "y", 1);
		vars.relative && _relativize(segment);
		return [(vars.type === "cubic") ? segment : pointsToSegment(segment, vars.curviness)];
	}
};

_getGSAP() && gsap.registerPlugin(MotionPathPlugin);

export { MotionPathPlugin as default };