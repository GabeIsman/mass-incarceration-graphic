var _ = require('underscore');
var data = require('../data/cleaned.csv');
var tau = 2 * Math.PI;
var findColor = require('./colors');
var dataUtils = require('./dataManipulation');
var orientations = require('./config').orientations;

var RADII = d3.scale.linear()
		.domain([0, 1, 2, 3])
		.range([0, 0.2, 0.6, 0.8, 1]);
/**
 * Does something maybe.
 *
 * @param {Object} options
 */
var Pie = function(options) {
	if (!options || !options.el) {
		throw new Error('Must pass a selector when initializing a Pie.');
	}
	this.el = d3.select(options.el);

	this.partition = d3.layout.partition()
		.sort(function(a, b) { return d3.ascending(a.name, b.name); });

	_.bindAll(this, 'filterArcText', 'handleResize', 'innerRadius', 'outerRadius', 'zoom');
	d3.select(window).on('resize', this.handleResize);
	this.handleResize();
	this.breadcrumb = [];
	this.currentDepth = 0;

	this.rawData = dataUtils.parseData(data);
	this.setOrientation(orientations[0]);
	this.renderFrame();
	this.renderData();
};


/**
 *
 */
Pie.prototype.handleResize = function() {
	var boundingRect = this.el.node().getBoundingClientRect();
	this.width = boundingRect.width;
	this.height = boundingRect.height;
	this.radius = Math.min(this.width / 3, this.height / 3);

	this.x = d3.scale.linear()
    .range([0, tau]);

	this.y = d3.scale.linear()
    .range([0, this.radius]);

	var self = this;
	this.arc = d3.svg.arc()
		.startAngle(function(d) { return Math.max(0, Math.min(tau, self.x(d.x))); })
		.endAngle(function(d) { return Math.max(0, Math.min(tau, self.x(d.x + d.dx))); })
		.innerRadius(function(d) { return Math.max(0, self.y(self.innerRadius(d))); })
		.outerRadius(function(d) { return Math.max(0, self.y(self.outerRadius(d))); });
};


Pie.prototype.renderFrame = function() {
	this.breadcrumbEl = this.el.append("div")
		.attr("class", "breadcrumb-container");

	this.svg = this.el.append("svg")
		.attr("width", this.width)
		.attr("height", this.height)
		.append("g")
			.attr("transform",
					"translate(" + (this.width / 2) + "," + (this.height / 2) + ")");

	//Tooltip description
	this.tooltip = d3.select('body')
		.append("div")
		.attr("id", "tooltip")
		.style("position", "absolute")
		.style("top", 0)
		.style("left", 0)
		.style("z-index", "10")
		.style("opacity", 0);

	this.center = this.svg
		.append("circle")
		.attr("r", this.radius / 5)
		.on("click", getHandler(this.zoomOut, this));
};


Pie.prototype.renderData = function() {

	var self = this;
	this.center.datum(this.root);

	// Move correctionalFacilities to the end of the array so it lies on top of the other elements
	var correctionalFacilitiesIndex = this.partitionedData.findIndex(function(item) {
		return item.name === 'Correctional Facilities';
	});
	if (correctionalFacilitiesIndex !== -1) {
		var correctionalFacilities = this.partitionedData.splice(correctionalFacilitiesIndex, 1);
		this.partitionedData = this.partitionedData.concat(correctionalFacilities);
	}

	this.path = this.svg.selectAll("path")
		.data(this.partitionedData, function(d) { return d.key; });
	this.path.enter().append("path");
	this.path.exit().remove();
	this.path
			.attr("d", this.arc)
			.style("fill", function(d) { return d.fill; })
			.style("opacity", function(d) { return d.name === 'Correctional Facilities' ? 0.1 : 0.9; })
			.attr("class", function(d) { return d.depth > 1 ? '' : 'clickable'; })
			.on("click", getHandler(this.zoomIn, this))
			.on("mouseover", getHandler(this.mouseOverArc, this))
			.on("mousemove", getHandler(this.mouseMoveArc, this))
			.on("mouseout", getHandler(this.mouseOutArc, this))
			.each(function(d) { d.currentPosition = selectTweenableAttrs(d); });

	this.renderLabels();
};


Pie.prototype.renderLabels = function(delay) {
	delay = delay || 0;
	this.texts = this.svg.selectAll(".label")
		.data(_.filter(this.partitionedData, this.filterArcText), function(d) { return d.key; });

	this.texts.exit()
		.remove();

	this.texts.enter()
		.append("text")
		.on('click', getHandler(this.zoomIn, this))
		.on("mouseover", getHandler(this.mouseOverArc, this))
		.on("mousemove", getHandler(this.mouseMoveArc, this))
		.attr("class", "label");

	var self = this;
	var texts;
	// if (transition) {
	// 	var texts = this.texts.transition().delay(delay)
	// }
	this.texts.transition().delay(delay)
		.attr("transform", function(d) { return "translate(" + self.arc.centroid(d) + ")"; })
		.attr("dy", ".35em") // vertical-align;
		.attr('text-anchor', 'middle')
		.text(function(d) { return d.name; });
};


// Zoom to the specified new root.
Pie.prototype.zoom = function(d) {
	var self = this;
	this.root = d;
	this.center.datum(d);
  this.svg.transition()
      .duration(750)
      .tween("scale", function() {
        var xd = d3.interpolate(self.x.domain(), [d.x, d.x + d.dx]);
				var cdd = d3.interpolate(self.currentDepth, d.depth);
            // yd = d3.interpolate(self.y.domain(), [d.y, 1]),
            // yr = d3.interpolate(self.y.range(), [d.y ? RADII(1) * self.radius : 0, self.radius]),

        return function(t) {
					self.x.domain(xd(t));
					self.currentDepth = cdd(t);
					// self.y.domain(yd(t)).range(yr(t));
				};
      })
    .selectAll("path")
      .attrTween("d", function(d) { return function() { return self.arc(d); }; })
			.attr("class", function(d) { return d.depth === self.currentDepth + 1 ? '' : 'clickable'; })
			.call(endall, function() { self.renderLabels(); });
	this.renderBreadcrumb();
};


Pie.prototype.chrootData = function(root) {
	var self = this;
	this.root = root;
	this.partitionedData = this.partition.nodes(this.root).slice(1);
	this.maxHeight = dataUtils.computeHeight(this.root);

	// This is a little strange, but because the outer radius depends on max height in order to have
	// smooth transitions of that radius we need to tween the max height during animations, and the
	// simplest way to do that is just with the rest of attributes on each node. So we store it here.
	this.partition.nodes(this.root).forEach(function(d) {
		d.maxHeight = self.maxHeight;
	});
}


Pie.prototype.fill = function(d) {
	var parent = d;
	var colorArray = findColor(parent.name);
	while (!colorArray && parent.depth > 1) {
		parent = parent.parent;
		colorArray = findColor(parent.name);
	}
	var colorString;
	if (!colorArray || !(colorString = colorArray[d.depth - 1] || colorArray[0])) {
		console.log("Color not found for ", parent.name, d.depth);
	}

	var color = typeof colorString === 'string' ? d3.rgb(colorString) : colorString;
	return color;
}


/**
 * Filter out the text on arcs that are too small.
 */
Pie.prototype.filterArcText = function(d, i) {
	// Filter out labels for the outer layers
	if (d.depth != this.currentDepth + 1) {
		return false;
	}

	// Filter out labels that aren't in the currently displayed tree
	var root = d;
	var x = 0;
	while (x < 5 && root.parent && root !== this.root) {
		x++;
		root = root.parent;
	}

	if (root !== this.root) {
		return false;
	}
console.log(this.x(d.dx) * this.radius, d.name, d);
	return (Math.abs(this.x(d.dx)) * this.radius) > 100;
};


Pie.prototype.mouseOverArc = function(target, d) {
	if (d.name !== 'Correctional Facilities') {
		d3.select(target).style("opacity", 1);
	}

	this.tooltip.html(formatDescription(d));
	return this.tooltip.transition()
		.duration(50)
		.style("opacity", 0.9);
}


Pie.prototype.mouseOutArc = function(target, d) {
	if (d.name !== 'Correctional Facilities') {
		d3.select(target).style("opacity", 0.9);
	}
	return this.tooltip.style("opacity", 0).style("transform", "translate(0, 0)");
}


Pie.prototype.mouseMoveArc = function(target, d) {
	return this.tooltip
		.style("transform", "translate(" + (d3.event.pageX + 10) + "px, " + (d3.event.pageY + 20) + "px)");
}


Pie.prototype.setOrientation = function(d) {
	this.currentOrientation = d;
	var confinement = dataUtils.flareData(this.rawData, this.currentOrientation.order);

	this.data = {
		name: 'root',
		children: [{
			name: 'Probation',
			description: 'People on probation',
			size: 3900000
		}, {
			name: 'Parole',
			description: 'People on parole',
			size: 807000
		}, {
			name: 'Correctional Facilities',
			description: 'People locked up',
			children: confinement.children
		}]
	};


	var self = this;
	this.partition
		.value(function(d) { return d.size; })
		.nodes(this.data)
		.forEach(function(d) {
			d.key = key(d);
			d.fill = self.fill(d);
			d.height = dataUtils.computeHeight(d);
		});
	this.chrootData(this.data);
}


Pie.prototype.renderBreadcrumb = function() {
	var breadcrumbs = [];
	var crumb = this.root;
	while (crumb.parent) {
		breadcrumbs.unshift(crumb);
		crumb = crumb.parent;
	}
	var crumbs = this.breadcrumbEl.selectAll(".breadcrumb")
		.data(breadcrumbs, function(d) { return d.key; });
	crumbs.exit().remove();
	crumbs.enter().append("a")
		.attr("class", "breadcrumb");
	crumbs.text(function(d) { return d.name });
}


Pie.prototype.zoomIn = function(target, node) {
	if (node.depth > this.currentDepth + 1) {
		return;
	}
	if (!node.children) {
		return;
	}

	this.breadcrumb.push(node);
	this.zoom(node);
}


Pie.prototype.zoomOut = function(target, node) {
	if (!node.parent) {
		return;
	}

	this.breadcrumb.pop();
	this.zoom(node.parent);
}


Pie.prototype.outerRadius = function(d) {
	if (d.depth <= 0) {
		return RADII(1)
	}
	var levelsToCover = d.maxHeight - d.height;
	var realDepth = d.depth - this.currentDepth;
	if (realDepth < 1) {
		return RADII((levelsToCover + 1) * realDepth + 1);
	}
	return RADII(d.maxHeight - d.height + 2);
}


Pie.prototype.innerRadius = function(d) {
	var realDepth = d.depth - this.currentDepth;
	// Render correctional facilities children all the way to the root, since it is transparent.
	if (this.currentDepth < 2 && d.parent.name === 'Correctional Facilities') {
		return RADII(1);
	}

	// If we're in the innermost ring.
 	if (realDepth < 2) {
		return RADII(Math.max(realDepth, 1));
	}

	return this.outerRadius(d.parent);
}


Pie.prototype.transitionOut = function() {
	// TODO: cool transition of data out
	this.path.remove();

	this.texts.data([]).exit().remove();
}


function formatNumber(x) {
	return x.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}


function formatDescription(d) {
	return	'<b>' + d.name + '</b></br>'+ d.description + '<br> (' + formatNumber(d.value) + ')';
}

function computeTextRotation(d) {
	var angle = (d.x + d.dx / 2) * 180 / Math.PI - 90;
	if (angle > 180) {
		angle = angle - 360;
	}
	return angle;
}

function key(d) {
	var k = [];
	while (d.depth) {
		k.push(d.name);
		d = d.parent;
	}
	return k.reverse().join(".");
}

function selectTweenableAttrs(d) {
	return {
		depth: d.depth,
		height: d.height,
		x: d.x,
		dx: d.dx,
		maxHeight: d.maxHeight
	};
}


/**
 * Takes a function and a context and returns a function set up to serve as a
 * handler to a d3 event. The original handler will be called with the datum and
 * the node, while its context will be the context specified here.
 *
 * @param	{Function} handler The event handler (typically an object method)
 * @param	{Object} ctx The object the method belongs to
 */
function getHandler(handler, ctx) {
	handler = _.bind(handler, ctx);
	return function(d) {
		// 'this' here will be the d3 event target.
		return handler(this, d);
	}
};


/**
 * Run code when a transition is completely done.
 */
function endall(transition, callback) {
  if (transition.size() === 0) { callback(); }
  var n = 0;
  transition
      .each(function() { ++n; })
      .each("end", function() { if (!--n) callback.apply(this, arguments); });
}


module.exports = Pie;
