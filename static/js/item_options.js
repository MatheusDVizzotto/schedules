// static/js/item_options.js — shared item type / dimension option data

// Hardcoded fallbacks — used only before /api/racks/config is loaded
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

// Set to non-null once /api/racks/config has been loaded — build functions
// then use only these instead of the hardcoded arrays above.
var _cfgTypes      = null;   // [{ value, label }, …]
var _cfgDimsByType = null;   // { typeName: [{ value, label }, …] }
var _cfgUnits      = null;   // [{ value, label }, …]

function setRacksConfigExtras(config) {
    _cfgTypes = [{ value: '', label: '— select —' }];
    config.types.forEach(function (name) {
        _cfgTypes.push({ value: name, label: name });
    });

    _cfgDimsByType = {};
    config.dimensions.forEach(function (d) {
        if (!_cfgDimsByType[d.type]) _cfgDimsByType[d.type] = [{ value: '', label: '— select —' }];
        var val = d.width ? (d.width + ' ' + d.thickness) : d.thickness;
        _cfgDimsByType[d.type].push({ value: val, label: val });
    });

    _cfgUnits = [{ value: '', label: '— unit —' }];
    config.units.forEach(function (u) {
        _cfgUnits.push({ value: u.name, label: u.name });
    });
}

function buildItemTypeOptions(selected) {
    var opts = _cfgTypes || ITEM_TYPE_OPTIONS;
    return opts.map(function (opt) {
        return '<option value="' + escHtml(opt.value) + '"' + (opt.value === selected ? ' selected' : '') + '>' + escHtml(opt.label) + '</option>';
    }).join('');
}

function buildDimensionOptions(type, selected, includeAll) {
    var opts;
    if (_cfgDimsByType) {
        opts = (_cfgDimsByType[type] || []).slice();
        if (!opts.length) opts = [{ value: '', label: '— select type first —' }];
    } else {
        if (type === 'Bearers')      opts = BEARER_SUBTYPE_OPTIONS.slice();
        else if (type === 'Boards')  opts = BOARD_OPTIONS.slice();
        else if (type === 'Blocks')  opts = BLOCK_OPTIONS.slice();
        else return '<option value="">— select type first —</option>';
    }
    if (!includeAll) opts = opts.filter(function (o) { return o.value !== 'All Dimensions'; });
    return opts.map(function (opt) {
        return '<option value="' + escHtml(opt.value) + '"' + (opt.value === selected ? ' selected' : '') + '>' + escHtml(opt.label) + '</option>';
    }).join('');
}

function buildQtyUnitOptions(selected) {
    var opts = _cfgUnits || QTY_UNIT_OPTIONS;
    return opts.map(function (opt) {
        return '<option value="' + escHtml(opt.value) + '"' + (opt.value === selected ? ' selected' : '') + '>' + escHtml(opt.label) + '</option>';
    }).join('');
}

function escHtml(str) {
    return String(str || '')
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}