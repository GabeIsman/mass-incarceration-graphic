

var ORIENTATIONS = [{
		text: 'Prison Type',
		order: ['prison_type', 'convicted_status', 'offense_category']
	},
	{
		text: 'Offense Type',
		order: ['offense_category', 'prison_type', 'specific_offense'],
	}];


module.exports = {
	orientations: ORIENTATIONS,
}
