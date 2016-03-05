
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
	'Probation': COLORS.DARKRED,
	'Parole': COLORS.GREY,
	'Correctional Facilities': ['#FFFFFF']
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

module.exports = function findColor(name, mapNum) {
	mapNum = mapNum || 0;
	if (COLOR_MAPS[mapNum][name]) {
		return COLOR_MAPS[mapNum][name];
	}
}
