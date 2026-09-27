// static/js/item_options.js — shared item type / dimension option data

var ITEM_TYPE_OPTIONS = [
    { value: '',        label: '— select —' },
    { value: 'Bearers', label: 'Bearers'    },
    { value: 'Boards',  label: 'Boards'     },
    { value: 'Blocks',  label: 'Blocks'     },
];

var BEARER_SUBTYPE_OPTIONS = [
    { value: '',               label: '— select —'    },
    { value: 'All Dimensions', label: 'All Dimensions' },
    { value: 'Low Profile',    label: 'Low Profile'   },
    { value: 'Mixed',          label: 'Mixed'         },
    { value: 'Noched',         label: 'Noched'        },
    { value: 'Square',         label: 'Square'        },
    { value: 'Standard',       label: 'Standard'      },
];

var BOARD_OPTIONS = [
    { value: '',               label: '— select —'     },
    { value: 'All Dimensions', label: 'All Dimensions' },
    { value: '65-85 12-15',    label: '65-85 12-15'    },
    { value: '65-85 16-19',    label: '65-85 16-19'    },
    { value: '65-85 20-23',    label: '65-85 20-23'    },
    { value: '65-85 25',       label: '65-85 25'       },
    { value: '85-105 12-15',   label: '85-105 12-15'   },
    { value: '85-105 16-19',   label: '85-105 16-19'   },
    { value: '85-105 20-23',   label: '85-105 20-23'   },
    { value: '85-105 25',      label: '85-105 25'      },
    { value: '105-125 12-15',  label: '105-125 12-15'  },
    { value: '105-125 16-19',  label: '105-125 16-19'  },
    { value: '105-125 20-23',  label: '105-125 20-23'  },
    { value: '105-125 25',     label: '105-125 25'     },
    { value: '125-145 12-15',  label: '125-145 12-15'  },
    { value: '125-145 16-19',  label: '125-145 16-19'  },
    { value: '125-145 20-23',  label: '125-145 20-23'  },
    { value: '125-145 25',     label: '125-145 25'     },
    { value: 'Narrow Mixed',   label: 'Narrow Mixed'   },
    { value: 'Standard Mixed', label: 'Standard Mixed' },
    { value: 'Heavy Mixed',    label: 'Heavy Mixed'    },
    { value: 'Mixed',          label: 'Mixed'          },
];

var BLOCK_OPTIONS = [
    { value: '',               label: '— select —'    },
    { value: 'All Dimensions', label: 'All Dimensions' },
    { value: '100x75',         label: '100x75'        },
    { value: '100x100',        label: '100x100'       },
];

var QTY_UNIT_OPTIONS = [
    { value: '',         label: '— unit —'  },
    { value: 'box',      label: 'box'       },
    { value: 'pc',       label: 'pc'        },
    { value: 'pallet',   label: 'pallet'    },
    { value: 'Stillage', label: 'Stillage'  },
];

// Dynamic options loaded from /api/racks/config at runtime
var _dynamicExtraTypes = [];       // list of { value, label }
var _dynamicExtraDims  = {};       // { typeName: [{ value, label }, …] }
var _dynamicExtraUnits = [];       // list of { value, label }

function buildQtyUnitOptions(selected) {
    var all = QTY_UNIT_OPTIONS.concat(_dynamicExtraUnits);
    return all.map(function (opt) {
        return '<option value="' + escHtml(opt.value) + '"' + (opt.value === selected ? ' selected' : '') + '>' + escHtml(opt.label) + '</option>';
    }).join('');
}

function setRacksConfigExtras(config) {
    config.types.forEach(function (name) {
        if (!ITEM_TYPE_OPTIONS.some(function (o) { return o.value === name; })) {
            _dynamicExtraTypes.push({ value: name, label: name });
        }
    });
    config.dimensions.forEach(function (d) {
        var val = d.width + ' ' + d.thickness;
        if (!_dynamicExtraDims[d.type]) _dynamicExtraDims[d.type] = [];
        _dynamicExtraDims[d.type].push({ value: val, label: val });
    });
    config.units.forEach(function (u) {
        if (!QTY_UNIT_OPTIONS.some(function (o) { return o.value === u.name; })) {
            _dynamicExtraUnits.push({ value: u.name, label: u.name });
        }
    });
}

function buildItemTypeOptions(selected) {
    var all = ITEM_TYPE_OPTIONS.concat(_dynamicExtraTypes);
    return all.map(function (opt) {
        return '<option value="' + escHtml(opt.value) + '"' + (opt.value === selected ? ' selected' : '') + '>' + escHtml(opt.label) + '</option>';
    }).join('');
}

function buildDimensionOptions(type, selected, includeAll) {
    var opts;
    if (type === 'Bearers') opts = BEARER_SUBTYPE_OPTIONS.slice();
    else if (type === 'Boards') opts = BOARD_OPTIONS.slice();
    else if (type === 'Blocks') opts = BLOCK_OPTIONS.slice();
    else opts = [{ value: '', label: '— select —' }];
    if (!includeAll) opts = opts.filter(function (o) { return o.value !== 'All Dimensions'; });
    var extras = _dynamicExtraDims[type] || [];
    extras.forEach(function (e) {
        if (!opts.some(function (o) { return o.value === e.value; })) opts.push(e);
    });
    if (opts.length === 1 && opts[0].value === '' && extras.length === 0) {
        return '<option value="">— select type first —</option>';
    }
    return opts.map(function (opt) {
        return '<option value="' + escHtml(opt.value) + '"' + (opt.value === selected ? ' selected' : '') + '>' + escHtml(opt.label) + '</option>';
    }).join('');
}

function escHtml(str) {
    return String(str || '')
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}