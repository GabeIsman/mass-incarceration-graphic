var colorbrewer = require('../lib/colors/colorbrewer');
var _ = require('underscore');

var RADII = d3.scale.linear()
    .domain([0, 1, 2, 3])
    .range([0, 0.2, 0.8, 1]);

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
  this.loadData();

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


Pie.prototype.loadData = function() {
  var self = this;
  return d3.json("flare-labeled.json", function(error, data) {
    if (error) {
      return console.warn(error);
    }
    self.data = data;
    self.renderData();
  });
};


Pie.prototype.renderData = function() {
  var self = this;
  // Compute the initial layout on the entire tree to sum sizes.
  // Also compute the full name and fill color for each node,
  // and stash the children so they can be restored as we descend.

  this.partition
    .value(function(d) { return d.size; })
    .nodes(this.data)
    .forEach(function(d) {
      d._children = d.children;
      d.sum = d.value;
      d.key = key(d);
      d.fill = self.fill(d);
    });

  // Now redefine the value function to use the previously-computed sum.
  this.partition
    .children(function(d, depth) { return depth < 2 ? d._children : null; })
    .value(function(d) { return d.sum; });

  this.center = this.svg.append("circle")
    .attr("r", this.radius / 5)
    .on("click", this.zoomOut);

  this.center.append("title")
      .text("zoom out");

  this.partitioned_data = this.partition.nodes(this.data).slice(1);

  this.path = this.svg.selectAll("path")
    .data(this.partitioned_data)
    .enter().append("path")
      .attr("d", this.arc)
      .style("fill", function(d) { return d.fill; })
      .each(function(d) { this._current = updateArc(d); })
      .on("click", this.zoomIn)
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
  var p = d;
  while (p.depth > 1) {
    p = p.parent;
  }
  var color = d3.lab(this.hue(p.name));
  color.l = this.luminance(d.sum);
  return color;
}


/**
 * Filter out the text on arcs that are too small.
 */
Pie.prototype.filterArcText = function(d, i) {
  return (d.dx * d.depth * this.radius / 3 ) > 14;
};


Pie.prototype.mouseOverArc = function(target, d) {
  d3.select(target).attr("stroke","black");

  this.tooltip.html(format_description(d));
  return this.tooltip.transition()
    .duration(50)
    .style("opacity", 0.9);
}


Pie.prototype.mouseOutArc = function(target, d) {
  d3.select(target).attr("stroke","")
  return this.tooltip.style("opacity", 0);
}


Pie.prototype.mouseMoveArc = function(target, d) {
  return this.tooltip
    .style("top", (d3.event.pageY - 10) + "px")
    .style("left", (d3.event.pageX + 10) + "px");
}


Pie.prototype.zoomIn = function(p) {
  if (p.depth > 1) {
    p = p.parent;
  }
  if (!p.children) {
    return;
  }
  this.zoom(p, p);
}


Pie.prototype.zoomOut = function(p) {
  if (!p.parent) {
    return;
  }
  this.zoom(p.parent, p);
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
        .on("click", self.zoomIn)
        .on("mouseover", getHandler(self.mouseOverArc, self))
        .on("mousemove", getHandler(self.mouseMoveArc, self))
        .on("mouseout", getHandler(self.mouseOutArc, self))
        .each(function(d) { this._current = enterArc(d); });

      self.path.transition()
        .style("fill-opacity", 1)
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
  return (d.x + d.dx / 2) * 180 / Math.PI - 90;
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


module.exports = Pie;



