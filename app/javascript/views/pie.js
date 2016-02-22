var colorbrewer = require('../lib/colors/colorbrewer');
var _ = require('underscore');
var data = require('../data/cleaned.csv');
var tau = 2 * Math.PI;

var RADII = d3.scale.linear()
		.domain([0, 1, 2, 3])
		.range([0, 0.25, 0.75, 1]);

var COLORS = {
	BLUEGREENS: ['#18816A', '#21B290', '#23CB8D'],
	ORANGES: ['#DB6000', '#FF7000', '#F98500', '#F98500'],
	PURPLES: ['#7070B1', '#8A82E1', '#A9A1FF', '#A9A1FF'],
	GREY: ['#676564'],
	GREEN: ['#64A612'],
	YELLOWS: ['#A67611', '#D09515', '#FEB211'],
	PERIWINKLE: ['#5964FF'],
	RED: ['#FF2C5D'],
	DARKRED: ['#631C1D', '#631C1D', '#631C1D', '#631C1D'],
};

var COLOR_MAPS = [{
	Federal: COLORS.YELLOWS,
	State: COLORS.BLUEGREENS,
	Local: COLORS.ORANGES,
	Kids: COLORS.PURPLES,
	Military: COLORS.DARKRED,
	'Indian County jails': COLORS.RED,
	'Territorial prisons': COLORS.GREEN,
	'Immigration Detention': COLORS.GREY,
	'Civil Commitment': COLORS.PERIWINKLE,
}, {
	drugs: COLORS.YELLOWS,
	violent: COLORS.BLUEGREENS,
	other: COLORS.ORANGES,
	property: COLORS.PURPLES,
	'public order': COLORS.DARKRED,
	'sexual': COLORS.RED,
	'status offense': COLORS.GREEN,
	'technical': COLORS.GREY,
	'person': COLORS.PERIWINKLE,
}];

function findColor(name) {
	for (var i = 0; i < COLOR_MAPS.length; i++) {
		if (COLOR_MAPS[i][name]) {
			return COLOR_MAPS[i][name];
		}
	}
}

var ORIENTATIONS = [{
		text: 'Prison Type',
		order: ['prison_type', 'convicted_status', 'offense_category']
	},
	{
		text: 'Offense Type',
		order: ['offense_category', 'prison_type', 'specific_offense'],
	}];
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

	// TODO: replace this with a custom scheme
	this.hue = d3.scale.category10();

	this.luminance = d3.scale.sqrt()
		.domain([0, 1e6])
		.clamp(true)
		.range([90, 20]);

	_.bindAll(this, 'filterArcText', 'arcTween', 'handleResize', 'innerRadius', 'outerRadius');
	d3.select(window).on('resize', this.handleResize);
	this.handleResize();

	this.currentOrientation = ORIENTATIONS[0];
	this.currentDepth = 1;

	this.renderFrame();
	this.data = parseData(data);
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

	this.partition.size([tau, this.radius]);

	// NOTE: this accounts for the inner circle used to zoom out
	var self = this;
	this.arc = d3.svg.arc()
		.startAngle(function(d) { return d.x; })
		// Leave a small gap between segments.
		.endAngle(function(d) { return d.x + d.dx - 0.01 / (d.depth + .5); })
		.innerRadius(this.innerRadius)
		.outerRadius(this.outerRadius);
};


Pie.prototype.renderFrame = function() {
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
		.style("z-index", "10")
		.style("opacity", 0);

	this.tabGroups = this.svg.selectAll('.tab')
		.data(ORIENTATIONS);
	this.tabs = this.tabGroups.enter()
		.append('g')
			.append('text')
			.attr('y', function(d, i) { return 40 + 30 * i; })
			.attr('x', 20)
			.text(function(d) { return d.text; });
	this.tabGroups
		.attr('transform', 'translate(-' + (this.width / 2) + ',-' + (this.height / 2) + ')')
		.on('click', getHandler(this.handleTabClicked, this));
	this.updateTabHighlight();;
};


Pie.prototype.renderData = function() {
	this.root = flareData(this.data, this.currentOrientation.order);

	var self = this;
	// Compute the initial layout on the entire tree to sum sizes.
	// Also compute the full name and fill color for each node,
	// and stash the children so they can be restored as we descend.

	this.partition
		.value(function(d) { return d.size; })
		.nodes(this.root)
		.forEach(function(d) {
			d.key = key(d);
			d.fill = self.fill(d);
			d.height = computeHeight(d);
		});


	this.center = this.svg.append("circle")
		.attr("r", this.radius / 5)
		.on("click", getHandler(this.zoomOut, this));

	this.center.append("title")
			.text("zoom out");

	this.partitioned_data = this.partition.nodes(this.root).slice(1);
	this.maxHeight = computeHeight(this.partitioned_data);

	// This is a little strange, but because the outer radius depends on max height in order to have
	// smooth transitions of that radius we need to tween the max height during animations, and the
	// simplest way to do that is just with the rest of attributes on each node. So we store it here.
	this.partition.nodes(this.root).forEach(function(d) {
		d.maxHeight = self.maxHeight;
	});

	this.path = this.svg.selectAll("path")
		.data(this.partitioned_data);
	this.path.enter().append("path")
			.attr("d", this.arc)
			.style("fill", function(d) { return d.fill; })
			.style("opacity", 0.9)
			.attr("class", function(d) { return d.depth > 1 ? '' : 'clickable'; })
			.on("click", getHandler(this.zoomIn, this))
			.on("mouseover", getHandler(this.mouseOverArc, this))
			.on("mousemove", getHandler(this.mouseMoveArc, this))
			.on("mouseout", getHandler(this.mouseOutArc, this))
			.each(function(d) { d.currentPosition = selectTweenableAttrs(d); });

	this.renderLabels();
};


Pie.prototype.renderLabels = function(delay) {
	this.texts = this.svg.selectAll("text")
		.data(this.partitioned_data, function(d) { return d.key; });

	this.texts.exit()
		.remove();

	this.texts.enter()
		.append("text");

	var self = this;
	this.texts.filter(this.filterArcText)
		.attr("transform", function(d) { return "rotate(" + computeTextRotation(d) + ")"; })
		.attr("x", function(d) { return d.depth > 1 ? self.outerRadius(d) : self.innerRadius(d) })
		.attr("dx", "6") // margin
		.attr("dy", ".35em") // vertical-align;
	if (delay) {
		this.texts.style("opacity", 0)
			.transition().delay(750).style("opacity", 1);
	}
};


// Zoom to the specified new root.
Pie.prototype.zoom = function(root, p) {
	if (document.documentElement.__transition__) return;
	var self = this;

	// Rescale outside angles to match the new layout.
	var outsideAngle = d3.scale.linear()
		.domain([0, tau])
		.range([p.x, p.x + p.dx]);

	this.center.datum(root);

	this.partitioned_data = this.partition.nodes(root).slice(1);
	this.path = this.path.data(this.partitioned_data, function(d) { return d.key; });
	this.maxHeight = computeHeight(this.partitioned_data);
	this.partitioned_data.forEach(function(d) {
		d.maxHeight = self.maxHeight;
	});

	function insideTarget(d) {
		if (root === d) {
			return {
				depth: 0,
				height: 0,
				x: 0,
				dx: tau,
				maxHeight: 0
			};
		}

		var target = {
			depth: d.depth - 1,
			height: d.height,
			dx: 0,
			x: tau,
			maxHeight: self.maxHeight
		};

		if (p.key > d.key) {
			target.x = 0;
		} else if (p.key < d.key) {
			target.x = tau;
		}

		return target;
	}

	// This is only used if there are hidden layers of depth that appear on zoom in or disapper on
	// zoom out.
	function outsideTarget(d) {
		return {
			depth: d.depth + 1,
			height: d.height,
			x: outsideAngle(d.x),
			dx: outsideAngle(d.x + d.dx) - outsideAngle(d.x),
			maxHeight: self.maxHeight
		};
	}


	var zoomingIn = root === p;
	var enterTarget;
	var exitTarget;

	if (zoomingIn) {
		// When zooming in, arcs enter from the outside and exit to the inside.
		// Entering outside arcs start from the old layout.
		enterTarget = outsideTarget;
		exitTarget = insideTarget;
		this.currentDepth++;
	} else {
		// When zooming out, arcs enter from the inside and exit to the outside.
		// Exiting outside arcs transition to the new layout.
		enterTarget = insideTarget;
		exitTarget = outsideTarget;
		this.currentDepth--;
	}

	var duration = d3.event.altKey ? 7500 : 750;
	d3.transition().duration(duration)
		.each(function() {
			self.path.exit().transition()
				.style("fill-opacity", function(d) {
					return d.depth === 1 + (zoomingIn ? 1 : 0);
				})
				.attrTween("d", function(d) { return self.arcTween(d, exitTarget(d)); })
				.remove();

			// TODO: this is redundant with renderData
			self.path.enter().append("path")
				.style("fill-opacity", function(d) {
					return d.	depth === 2 - (zoomingIn ? 1 : 0);
				})
				.style("fill", function(d) { return d.fill; })
				.on("click", getHandler(self.zoomIn, self))
				.on("mouseover", getHandler(self.mouseOverArc, self))
				.on("mousemove", getHandler(self.mouseMoveArc, self))
				.on("mouseout", getHandler(self.mouseOutArc, self))
				.each(function(d) { d.currentPosition = enterTarget(d); });


			self.path.transition()
				.style("fill-opacity", 1)
				.attr("class", function(d) { return d.depth > 1 || !d.children ? '' : 'clickable'; })
				.attrTween("d", function(d) {
					return self.arcTween(d, selectTweenableAttrs(d));
				});
		});

	this.renderLabels(duration /* delay */);
};


Pie.prototype.chrootData = function(root) {
	this.partitioned_data = this.partition.nodes(root).slice(1);
	var allNodes = this.partition.nodes(this.root).slice(1);
	this.computeRadii(allNodes);
}


Pie.prototype.fill = function(d) {
	var parent = d;
	while (parent.depth > 1) {
		parent = parent.parent;
	}
	var colorString;
	var colorArray = findColor(parent.name);
	if (!colorArray || !(colorString = colorArray[d.depth - 1])) {
		console.log("Color not found for ", parent.name, d.depth);
	}

	var color = d3.rgb(colorString);
	return color;
}


/**
 * Filter out the text on arcs that are too small.
 */
Pie.prototype.filterArcText = function(d, i) {
	// Filter out labels for the middle layers
	if (d.depth != 1 && d.children) {
		return false;
	}
	return (d.dx * d.depth * this.radius / 3 ) > 14;
};


Pie.prototype.mouseOverArc = function(target, d) {
	d3.select(target).style("opacity", 1);

	this.tooltip.html(formatDescription(d));
	return this.tooltip.transition()
		.duration(50)
		.style("opacity", 0.9);
}


Pie.prototype.mouseOutArc = function(target, d) {
	d3.select(target).style("opacity", 0.9);
	return this.tooltip.style("opacity", 0);
}


Pie.prototype.mouseMoveArc = function(target, d) {
	return this.tooltip
		.style("transform", "translate(" + (d3.event.pageX + 10) + ", " + (d3.event.pageY - 10) + ")");
}


Pie.prototype.handleTabClicked = function(target, data) {
	this.currentOrientation = data;
	this.updateTabHighlight();
	this.transitionOut();
	this.renderData();
}


Pie.prototype.updateTabHighlight = function() {
	var self = this;
	this.tabGroups.attr('class', function(d) {
		return 'tab clickable' + (d === self.currentOrientation ? ' current' : '');
	});
}


Pie.prototype.zoomIn = function(target, node) {
	if (node.depth > 1) {
		return;
	}
	if (!node.children) {
		return;
	}
	this.zoom(node, node);
}


Pie.prototype.zoomOut = function(target, node) {
	if (!node.parent) {
		return;
	}
	this.zoom(node.parent, node);
}


Pie.prototype.getMaxRadius = function() {
	return RADII(this.maxHeight + 1) * this.radius - 1;;
};


Pie.prototype.outerRadius = function(d) {
	if (d.outerRadius) return d.outerRadius;
	return RADII(d.maxHeight - d.height + 2) * this.radius - 1;
}


Pie.prototype.innerRadius = function(d) {
	// If we're in the innermost ring.
 	if (d.depth < 2) {
		return RADII(d.depth) * this.radius + 1;
	}
	return RADII(d.maxHeight - d.height + 1) * this.radius + 1;
}

/**
 * Returns a function that smoothly tweens an arc between the nodes current position and the given
 * target.
 * @param	 {Object} node The data node being animated. Must have 'currentPosition' set to an object
 *	 with d, dx, and depth attributes.
 * @param	 {Object} targetPosition The final position. This is an object with d, dx, and depth
*		attributes.
 * @returns {Function} A function that takes a float between 0 and 1 and returns the interpolated
 *	 arc.
 */
Pie.prototype.arcTween = function(node, targetPosition) {
	var interpolator = d3.interpolate(node.currentPosition, targetPosition);
	var self = this;
	return function(t) {
		node.currentPosition = interpolator(t);
		return self.arc(node.currentPosition);
	};
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

var COMMAS = /,/g;

/**
 * Parses the numbers into javascript Numbers.
 * @param	 {Array<Object>} data The csvified data.
 * @returns {Array<Object>} The parsed data.
 */
function parseData(data) {
	return _.map(data, function(line) {
		line = _.mapObject(line, function(value) {
			if (typeof value === 'string') {
				return value.trim();
			}
			return value;
		});

		if (typeof line.number === 'string') {
			_.extend(line, { number: parseInt(line.number.replace(COMMAS, '')) });
		}

		return line;
	});
}


function flareData(data, groupSequence) {
	return {
		name: 'Flare',
		description: '',
		children: flareDataRecursive(data, groupSequence)
	};
	return parent;
}

function flareDataRecursive(data, groupSequence) {
	if (groupSequence.length === 0) {
		return [];
	}
	var currentGroup = groupSequence[0];
	var remainingSequence = groupSequence.slice(1);
	var groupedData = _.groupBy(data, currentGroup);

	// If this group has no differentiation on this key then skip it
	if (_.keys(groupedData).length === 1) {
		return flareDataRecursive(data, remainingSequence);
	}

	return _.map(groupedData, function(value, key) {
		var child = {
			name: key,
			description: '' // Need to figure this out
		};
		child.size = _.reduce(value, function(memo, item) {
			return memo + item.number;
		}, 0);
		if (remainingSequence.length > 0) {
			child.children = flareDataRecursive(value, remainingSequence);
		}
		return child;
	});
}

function computeHeight(data) {
	if (data.children) {
		return 1 + computeHeight(data.children);
	} else if (_.isArray(data)) {
		return _.max(_.map(data, computeHeight));
	}

	return 1;
}

module.exports = Pie;
