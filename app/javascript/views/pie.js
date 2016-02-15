var colorbrewer = require('../lib/colors/colorbrewer');
var _ = require('underscore');
var data = require('../data/sample.csv');

var RADII = d3.scale.linear()
    .domain([0, 1, 2, 3])
    .range([0, 0.2, 0.8, 1]);

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

var COLOR_MAP = {
  Federal: COLORS.YELLOWS,
  State: COLORS.BLUEGREENS,
  Local: COLORS.ORANGES,
  Juvenile: COLORS.PURPLES,
  Military: COLORS.DARKRED,
  'Indian County jails': COLORS.RED,
  'Territorial prisons': COLORS.GREEN,
  'Immigration Detention': COLORS.GREY,
  'Civil Commitment': COLORS.PERIWINKLE,
};

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

  d3.select(window).on('resize', _.bind(this.handleResize, this));
  this.handleResize();

  this.renderFrame();
	this.data = parseData(data);
	this.renderData();

  _.bindAll(this, 'filterArcText', 'zoomOut', 'zoomIn');
};


/**
 *
 */
Pie.prototype.handleResize = function() {
  var boundingRect = this.el.node().getBoundingClientRect();
  this.width = boundingRect.width;
  this.height = boundingRect.height;
  this.radius = Math.min(this.width / 2, this.height / 2);

  this.partition.size([2 * Math.PI, this.radius]);

  // NOTE: this accounts for the inner circle used to zoom out
  var self = this;
  this.arc = d3.svg.arc()
    .startAngle(function(d) { return d.x; })
    .endAngle(function(d) { return d.x + d.dx - .01 / (d.depth + .5); })
    .innerRadius(function(d) { return RADII(d.depth) * self.radius })
    .outerRadius(function(d) { return RADII(d.depth + 1) * self.radius - 1; });
};


Pie.prototype.renderFrame = function() {
  this.svg = this.el.append("svg")
    .attr("width", this.width)
    .attr("height", this.height)
    .append("g")
      .attr("transform",
          "translate(" + (this.width / 2) + "," + (this.height / 2) + ")");

  //Tooltip description
  this.tooltip = this.el
    .append("div")
    .attr("id", "tooltip")
    .style("position", "absolute")
    .style("z-index", "10")
    .style("opacity", 0);
};


Pie.prototype.renderData = function() {
	var data = flareData(this.data, ['prison_type', 'convicted_status', 'offense_category', 'specific_offense']);
  var self = this;
  // Compute the initial layout on the entire tree to sum sizes.
  // Also compute the full name and fill color for each node,
  // and stash the children so they can be restored as we descend.

  this.partition
    .value(function(d) { return d.size; })
    .nodes(data)
    .forEach(function(d) {
      d.key = key(d);
      d.fill = self.fill(d);
    });

  this.center = this.svg.append("circle")
    .attr("r", this.radius / 5)
    .on("click", getHandler(this.zoomOut, this));

  this.center.append("title")
      .text("zoom out");

  this.partitioned_data = this.partition.nodes(data).slice(1);

  this.path = this.svg.selectAll("path")
    .data(this.partitioned_data)
    .enter().append("path")
      .attr("d", this.arc)
      .style("fill", function(d) { return d.fill; })
      .style("opacity", 0.9)
      .each(function(d) { this._current = updateArc(d); })
      .attr("class", function(d) { return d.depth > 1 ? '' : 'clickable'; })
      .on("click", getHandler(this.zoomIn, this))
      .on("mouseover", getHandler(this.mouseOverArc, this))
      .on("mousemove", getHandler(this.mouseMoveArc, this))
      .on("mouseout", getHandler(this.mouseOutArc, this));

    this.texts = this.svg.selectAll("text")
      .data(this.partitioned_data)
      .enter().append("text")
      .filter(this.filterArcText)
      .attr("transform", function(d) { return "rotate(" + computeTextRotation(d) + ")"; })
      .attr("x", function(d) { return d.depth > 1 ? RADII(d.depth + 1) * self.radius : RADII(d.depth) * self.radius })
      .attr("dx", "6") // margin
      .attr("dy", ".35em") // vertical-align
      .text(function(d,i) { return d.name; });
};


Pie.prototype.fill = function(d) {
  var parent = d;
  while (parent.depth > 1) {
    parent = parent.parent;
  }
  var colorString;
  if (!COLOR_MAP[parent.name] || !(colorString = COLOR_MAP[parent.name][d.depth - 1])) {
    console.log("Color not found for ", parent.name, d.depth);
  }

  var color = d3.rgb(colorString);
  return color;
}


/**
 * Filter out the text on arcs that are too small.
 */
Pie.prototype.filterArcText = function(d, i) {
  return (d.dx * d.depth * this.radius / 3 ) > 14;
};


Pie.prototype.mouseOverArc = function(target, d) {
  d3.select(target).style("opacity", 1);

  this.tooltip.html(format_description(d));
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
    .style("top", (d3.event.pageY - 10) + "px")
    .style("left", (d3.event.pageX + 10) + "px");
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


// Zoom to the specified new root.
Pie.prototype.zoom = function(root, p) {
  if (document.documentElement.__transition__) return;

  // Rescale outside angles to match the new layout.
  var enterArc,
      exitArc,
      outsideAngle = d3.scale.linear().domain([0, 2 * Math.PI]);

  function insideArc(d) {
    if (p.key > d.key) {
      return {depth: d.depth - 1, x: 0, dx: 0};
    } else if (p.key < d.key) {
      return {depth: d.depth - 1, x: 2 * Math.PI, dx: 0};
    } else {
      return {depth: 0, x: 0, dx: 2 * Math.PI};
    }
  }

  function outsideArc(d) {
    return {
      depth: d.depth + 1,
      x: outsideAngle(d.x),
      dx: outsideAngle(d.x + d.dx) - outsideAngle(d.x)
    };
  }

  this.center.datum(root);

  // When zooming in, arcs enter from the outside and exit to the inside.
  // Entering outside arcs start from the old layout.
  if (root === p) {
    enterArc = outsideArc;
    exitArc = insideArc;
    outsideAngle.range([p.x, p.x + p.dx]);
  }

  var new_data = this.partition.nodes(root).slice(1);

  // TODO: figure this out, why does this need to be assigned?
  this.path = this.path.data(new_data, function(d) { return d.key; });

  // When zooming out, arcs enter from the inside and exit to the outside.
  // Exiting outside arcs transition to the new layout.
  if (root !== p) {
    enterArc = insideArc;
    exitArc = outsideArc;
    outsideAngle.range([p.x, p.x + p.dx]);
  }

  var self = this;
  d3.transition().duration(d3.event.altKey ? 7500 : 750)
    .each(function() {
      self.path.exit().transition()
        .style("fill-opacity", function(d) {
          return d.depth === 1 + (root === p) ? 1 : 0;
        })
        .attrTween("d", function(d) {
          return arcTween.call(this, exitArc(d), self.arc);
        })
        .remove();

      // TODO: this is redundant with renderData
      self.path.enter().append("path")
        .style("fill-opacity", function(d) {
          return d.depth === 2 - (root === p) ? 1 : 0;
        })
        .style("fill", function(d) { return d.fill; })
        .on("click", getHandler(self.zoomIn, self))
        .on("mouseover", getHandler(self.mouseOverArc, self))
        .on("mousemove", getHandler(self.mouseMoveArc, self))
        .on("mouseout", getHandler(self.mouseOutArc, self))
        .each(function(d) { this._current = enterArc(d); });

      self.path.transition()
        .style("fill-opacity", 1)
        .attr("class", function(d) { return d.depth > 1 || !d.children ? '' : 'clickable'; })
        .attrTween("d", function(d) {
          return arcTween.call(this, updateArc(d), self.arc);
        });
    });


  // TODO: this should be abstracted.
  this.texts = this.texts.data(new_data, function(d) { return d.key; });

  this.texts.exit()
    .remove()
  this.texts.enter()
    .append("text")

  this.texts.style("opacity", 0)
    .attr("transform", function(d) {
      return "rotate(" + computeTextRotation(d) + ")";
    })
    .attr("x", function(d) { return d.depth > 1 ? RADII(d.depth + 1) * self.radius : RADII(d.depth) * self.radius })
    .attr("dx", "6") // margin
    .attr("dy", ".35em") // vertical-align
    .filter(this.filterArcText)
    .text(function(d,i) {return d.name})
    .transition().delay(750).style("opacity", 1);
}


function format_number(x) {
  return x.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}


function format_description(d) {
  return  '<b>' + d.name + '</b></br>'+ d.description + '<br> (' + format_number(d.value) + ')';
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

function arcTween(b, arc) {
  var i = d3.interpolate(this._current, b);
  this._current = i(0);
  return function(t) {
    return arc(i(t));
  };
}

function updateArc(d) {
  return {depth: d.depth, x: d.x, dx: d.dx};
}


/**
 * Takes a function and a context and returns a function set up to serve as a
 * handler to a d3 event. The original handler will be called with the datum and
 * the node, while its context will be the context specified here.
 *
 * @param  {Function} handler The event handler (typically an object method)
 * @param  {Object} ctx The object the method belongs to
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
 * @param   {Array<Object>} data The csvified data.
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


module.exports = Pie;
