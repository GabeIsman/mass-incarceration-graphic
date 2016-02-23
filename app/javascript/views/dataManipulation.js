var _ = require('underscore');
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


module.exports = {
	parseData: parseData,
	flareData: flareData,
	computeHeight: computeHeight,
}
