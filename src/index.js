import * as Highcharts from 'highcharts';
import 'highcharts/modules/sunburst.js';
import 'highcharts/modules/exporting';

/**
 * Parses metadata into structured dimensions and measures.
 * @param {Object} metadata - The metadata object from SAC data binding.
 * @returns {Object} An object containing parsed dimensions, measures, and their maps.
 */
var parseMetadata = metadata => {
    const { dimensions: dimensionsMap, mainStructureMembers: measuresMap } = metadata;
    const dimensions = [];
    for (const key in dimensionsMap) {
        const dimension = dimensionsMap[key];
        dimensions.push({ key, ...dimension });
    }

    const measures = [];
    for (const key in measuresMap) {
        const measure = measuresMap[key];
        measures.push({ key, ...measure });
    }
    return { dimensions, measures, dimensionsMap, measuresMap };
}

(function () {
    class Sunburst extends HTMLElement {
        constructor() {
            super();
            this.attachShadow({ mode: 'open' });

            // Create a CSSStyleSheet for the shadow DOM
            const sheet = new CSSStyleSheet();
            sheet.replaceSync(`
                @font-face {
                    font-family: '72';
                    src: url('../fonts/72-Regular.woff2') format('woff2');
                }
                #container {
                    width: 100%;
                    height: 100%;
                    font-family: '72';
                }
            `);

            // Apply the stylesheet to the shadow DOM
            this.shadowRoot.adoptedStyleSheets = [sheet];

            // Add the container for the chart
            this.shadowRoot.innerHTML = `
                <div id="container"></div>    
            `;

            this._lastSentCategories = [];
            this._selectedPoint = null;
            this._currentLevel = 2;
        }

        /**
         * Called when the widget is resized.
         * @param {number} width - New width of the widget.
         * @param {number} height - New height of the widget.
         */
        onCustomWidgetResize(width, height) {
            this._renderChart();
        }

        /**
         * Called after widget properties are updated.
         * @param {Object} changedProperties - Object containing changed attributes.
         */
        onCustomWidgetAfterUpdate(changedProperties) {
            this._renderChart();
        }

        /**
         * Called when the widget is destroyed. Cleans up chart instance.
         */
        onCustomWidgetDestroy() {
            if (this._chart) {
                this._chart.destroy();
                this._chart = null;
            }
            this._selectedPoint = null;
        }

        /**
         * Specifies which attributes should trigger re-rendering on change.
         * @returns {string[]} An array of observed attribute names.
         */
        static get observedAttributes() {
            return [
                'chartTitle', 'titleSize', 'titleFontStyle', 'titleAlignment', 'titleColor',                // Title properties
                'chartSubtitle', 'subtitleSize', 'subtitleFontStyle', 'subtitleAlignment', 'subtitleColor', // Subtitle properties
                'scaleFormat', 'decimalPlaces',                                                             // Number formatting properties
                'customColors'
            ];
        }

        /**
        * Called when an observed attribute changes.
        * @param {string} name - The name of the changed attribute.
        * @param {string} oldValue - The old value of the attribute.
        * @param {string} newValue - The new value of the attribute.
        */
        attributeChangedCallback(name, oldValue, newValue) {
            if (oldValue !== newValue) {
                this[name] = newValue;
                this._renderChart();
            }
        }

        _processSeriesData(data, dimensions, measure) {
            const seriesData = [];
            const nodeMap = new Map();

            data.forEach(row => {
                let parentId = '';
                let pathId = '';

                dimensions.forEach((dim, level) => {
                    const value = row[dim.key].label || `Unknown-${level}`;
                    pathId += (pathId ? '/' : '') + value;

                    if (!nodeMap.has(pathId)) {
                        nodeMap.set(pathId, true);
                        const node = {
                            id: pathId,
                            parent: level === 0 ? '' : parentId,
                            name: value,
                            description: dim.description || '',
                        };

                        // Assign value only on the leaf level
                        if (level === dimensions.length - 1) {
                            node.value = row[measure.key].raw ?? 0; // Default to 0 if raw value is undefined
                        }

                        seriesData.push(node);
                    }

                    parentId = pathId; // Update parentId for the next level
                });
            });

            return seriesData;
        }



        /**
         * Renders the chart using the provided data and metadata.
         */
        _renderChart() {
            const dataBinding = this.dataBinding;
            if (!dataBinding || dataBinding.state !== 'success' || !dataBinding.data || dataBinding.data.length === 0) {
                if (this._chart) {
                    this._chart.destroy();
                    this._chart = null;
                    this._selectedPoint = null;
                }
                return;
            }
            console.log('dataBinding:', dataBinding);
            const { data, metadata } = dataBinding;
            const { dimensions, measures } = parseMetadata(metadata);

            if (dimensions.length === 0 || measures.length === 0) {
                if (this._chart) {
                    this._chart.destroy();
                    this._chart = null;
                    this._selectedPoint = null;
                }
                return;
            }

            const [dimension] = dimensions;
            const [measure] = measures;

            const allSeriesData = this._processSeriesData(data, dimensions, measure);
            console.log('seriesData:', allSeriesData);
            const seriesData = allSeriesData.filter(node => {
                const depth = node.id.split('/').length;
                return depth <= this._currentLevel;
            });

            const seriesName = measures[0]?.label || 'Value';

            const dimDescriptions = dimensions.map(dim => {
                const dimDescription = dim.description || 'Dimension Description';
                return dimDescription;
            });
            console.log('dimDescriptions:', dimDescriptions);

            const dimPart = dimDescriptions.join(', ');
            console.log('dimPart:', dimPart);

            const autoTitle = `${seriesName} per ${dimPart}`;
            console.log('autoTitle:', autoTitle);

            const totalLevels = dimensions.length;

            const levels = [];

            // Level 1
            levels.push({
                level: 1,
                colorByPoint: true
            });

            // Levels 2 to totalLevels: inherit and apply brightness variation
            for (let i = 2; i <= totalLevels; i++) {
                levels.push({
                    level: i,
                    colorVariation: {
                        key: 'brightness',
                        to: 0.5 // Adjust brightness for deeper levels
                    }
                })
            }

            const validCategoryNames = allSeriesData.filter(node => node.parent === '').map(node => node.name) || [];
            console.log('validCategoryNames: ', validCategoryNames);
            if (JSON.stringify(this._lastSentCategories) !== JSON.stringify(validCategoryNames)) {
                this._lastSentCategories = validCategoryNames;
                this.dispatchEvent(new CustomEvent('propertiesChanged', {
                    detail: {
                        properties: {
                            validCategoryNames
                        }
                    }
                }));
            }

            const handlePointClick = (event) => this._handlePointClick(event, dataBinding, dimensions);
            const scaleFormat = (value) => this._scaleFormat(value);
            const subtitleText = this._updateSubtitle();
            const titleText = this._updateTitle(autoTitle);

            Highcharts.setOptions({
                lang: {
                    thousandsSep: ','
                },
                navigation: {
                    buttonOptions: {
                        symbolStroke: '#004b8d',  // Outline color
                        symbolFill: 'transparent', // No fill
                        symbolStrokeWidth: 1,
                        // Core button shape settings
                        height: 32,          // Ensure square for circle
                        width: 32,
                        theme: {
                            r: 16,           // Rounded corners (half width = full circle)
                            fill: '#f7f7f7', // Background color
                            stroke: '#ccc',  // Thin outer border
                            'stroke-width': 0.8,
                            style: {
                                cursor: 'pointer'
                            }
                        }
                    }
                }
            });

            const defaultColors = ['#004b8d', '#939598', '#faa834', '#00aa7e', '#47a5dc', '#006ac7', '#ccced2', '#bf8028', '#00e4a7'];
            const customColors = this.customColors || [];

            allSeriesData.forEach(node => {
                if (node.parent === '') {
                    const colorEntry = customColors.find(c => c.category === node.name);
                    if (colorEntry && colorEntry.color) {
                        node.color = colorEntry.color;
                    } else {
                        // Use default color if no custom color is found
                        const index = validCategoryNames.indexOf(node.name);
                        node.color = defaultColors[index % defaultColors.length];
                    }
                }
            });

            console.log('seriesData with colors:', allSeriesData);

            Highcharts.SVGRenderer.prototype.symbols.contextButton = function (x, y, w, h) {
                const radius = w * 0.11;
                const spacing = w * 0.4;

                const offsetY = 2;    // moves dots slightly down
                const offsetX = 1;  // moves dots slightly to the right

                const centerY = y + h / 2 + offsetY;
                const startX = x + (w - spacing * 2) / 2 + offsetX;

                const makeCirclePath = (cx, cy, r) => [
                    'M', cx - r, cy,
                    'A', r, r, 0, 1, 0, cx + r, cy,
                    'A', r, r, 0, 1, 0, cx - r, cy
                ];

                return [].concat(
                    makeCirclePath(startX, centerY, radius),
                    makeCirclePath(startX + spacing, centerY, radius),
                    makeCirclePath(startX + spacing * 2, centerY, radius)
                );
            };

            const chartOptions = {
                chart: {
                    type: 'sunburst',
                    style: {
                        fontFamily: "'72', sans-serif"
                    }
                },
                title: {
                    text: titleText,
                    align: this.titleAlignment || "left",
                    style: {
                        fontSize: this.titleSize || "16px",
                        fontWeight: this.titleFontStyle || "bold",
                        color: this.titleColor || "#004B8D",
                    },
                },
                subtitle: {
                    text: subtitleText,
                    align: this.subtitleAlignment || "left",
                    style: {
                        fontSize: this.subtitleSize || "11px",
                        fontStyle: this.subtitleFontStyle || "normal",
                        color: this.subtitleColor || "#000000",
                    },
                },
                credits: {
                    enabled: false
                },
                exporting: {
                    enabled: true,
                    buttons: {
                        contextButton: {
                            enabled: false,
                        }
                    },
                    menuItemDefinitions: {
                        resetFilters: {
                            text: 'Reset Filters',
                            onclick: () => {
                                const linkedAnalysis = this.dataBindings.getDataBinding('dataBinding').getLinkedAnalysis();
                                if (linkedAnalysis) {
                                    linkedAnalysis.removeFilters();
                                    if (this._selectedPoint) {
                                        this._selectedPoint.select(false, false);
                                        this._selectedPoint = null;
                                    }
                                }
                            }

                        }
                    }
                },
                plotOptions: {
                    series: {
                        cursor: 'pointer',
                        allowPointSelect: true,
                        point: {
                            events: {
                                select: (event) => {
                                    handlePointClick;

                                    const node = event.target;
                                    const depth = node.id.split('/').length;

                                    if (depth === this._currentLevel) {
                                        this._currentLevel++;
                                        this._renderChart();
                                    }
                                },
                                unselect: handlePointClick
                            },
                        },
                        dataLabels: {
                            enabled: true,
                            style: {
                                fontWeight: 'normal'
                            }
                        }
                    }
                },
                tooltip: {
                    valueDecimals: 0,
                    followPointer: true,
                    hideDelay: 0,
                    useHTML: true,
                    formatter: this._formatTooltip(scaleFormat)
                },
                series: [{
                    type: 'sunburst',
                    name: measure.label || 'Value',
                    data: allSeriesData,
                    allowDrillToNode: true,
                    levels: levels
                }]
            };
            this._chart = Highcharts.chart(this.shadowRoot.getElementById('container'), chartOptions);

            const container = this.shadowRoot.getElementById('container');

            container.addEventListener("mouseenter", () => {
                this._chart.update(
                    {
                        exporting: {
                            buttons: {
                                contextButton: {
                                    enabled: true,
                                    symbol: 'contextButton',
                                    menuItems: ['resetFilters']
                                },
                            },
                        },
                    },
                    true
                ); // true = redraw
            });

            container.addEventListener("mouseleave", () => {
                this._chart.update(
                    {
                        exporting: {
                            buttons: {
                                contextButton: {
                                    enabled: false,
                                },
                            },
                        },
                    },
                    true
                );
            });
        }

        /**
         * 
         * @param {string} autoTitle - Automatically generated title based on series and dimensions.
         * @returns {string} The title text.
         */
        _updateTitle(autoTitle) {
            if (!this.chartTitle || this.chartTitle.trim() === '') {
                return autoTitle;
            } else {
                return this.chartTitle;
            }
        }

        /**
         * Determines subtitle text based on scale format or user input.
         * @returns {string} The subtitle text.
         */
        _updateSubtitle() {
            if (!this.chartSubtitle || this.chartSubtitle.trim() === '') {
                let subtitleText = '';
                switch (this.scaleFormat) {
                    case 'k':
                        subtitleText = 'in k';
                        break;
                    case 'm':
                        subtitleText = 'in m';
                        break;
                    case 'b':
                        subtitleText = 'in b';
                        break;
                    default:
                        subtitleText = '';
                        break;
                }
                return subtitleText;
            } else {
                return this.chartSubtitle;
            }
        }

        _scaleFormat(value) {
            let scaledValue = value;
            let valueSuffix = '';

            switch (this.scaleFormat) {
                case 'k':
                    scaledValue = value / 1000;
                    valueSuffix = 'k';
                    break;
                case 'm':
                    scaledValue = value / 1000000;
                    valueSuffix = 'm';
                    break;
                case 'b':
                    scaledValue = value / 1000000000;
                    valueSuffix = 'b';
                    break;
                default:
                    break;
            }
            return {
                scaledValue: scaledValue.toFixed(this.decimalPlaces),
                valueSuffix
            };
        }

        /**
         * Formats the tooltip content for the chart.
         * @param {Function} scaleFormat - A function to scale and format the value.
         * @returns {Function} A function that formats the tooltip content.
         */
        _formatTooltip(scaleFormat) {
            return function () {
                console.log(this);
                if (this.point) {
                    // Retrieve the category data using the index
                    const name = this.point.name;
                    const description = this.point.description || 'Description';
                    const { scaledValue, valueSuffix } = scaleFormat(this.point.value);
                    const value = Highcharts.numberFormat(scaledValue, -1, '.', ',');
                    const valueWithSuffix = `${value} ${valueSuffix}`;
                    return `
                        <div style="text-align: left; font-family: '72', sans-serif; font-size: 14px;">
                        <div style="font-size: 14px; font-weight: normal; color: #666666;">${this.series.name}</div>
                            <div style="font-size: 18px; font-weight: normal; color: #000000;">${valueWithSuffix}</div>
                            <hr style="border: none; border-top: 1px solid #eee; margin: 5px 0;">
                            <table style="width: 100%; font-size: 14px; color: #000000;">
                                <tr>
                                    <td style="text-align: left; padding-right: 10px;">${description}</td>
                                    <td style="text-align: right; padding-left: 10px;">${name}</td>
                                </tr>
                            </table>
                        </div>
                    `;

                } else {
                    return 'error with data';
                }
            };
        }

        _handlePointClick(event, dataBinding, dimensions) {
            const point = event.target;
            if (!point) {
                return;
            }
            console.log('Point clicked:', point);

            const name = point.name;
            const path = point.id;
            const level = path.split('/').length - 1;
            const labels = path.split('/');

            console.log('Path:', path);
            console.log('Level:', level);
            console.log('Labels:', labels);

            const dimension = dimensions[level];
            if (!dimension) {
                console.log('No dimension found for level:', level);
                return;
            }

            const dimensionKey = dimension.key;
            console.log('Dimension Key:', dimensionKey);
            const dimensionId = dimension.id;
            console.log('Dimension ID:', dimensionId);
            const label = name;

            const selectedItem = dataBinding.data.find((item) => item[dimensionKey]?.label === label);

            const linkedAnalysis = this.dataBindings.getDataBinding('dataBinding').getLinkedAnalysis();

            // Deselect previously selected point
            if (this._selectedPoint && this._selectedPoint !== point) {
                linkedAnalysis.removeFilters();
                this._selectedPoint.select(false, false);
                this._selectedPoint = null;
            }

            if (event.type === 'select') {
                if (selectedItem) {
                    const selection = {};
                    labels.forEach((label, index) => {
                        const dim = dimensions[index];
                        if (dim && selectedItem[dim.key]) {
                            selection[dim.id] = selectedItem[dim.key].id;
                        }
                    });

                    linkedAnalysis.setFilters(selection);
                    this._selectedPoint = point;
                }
            } else if (event.type === 'unselect') {
                linkedAnalysis.removeFilters();
                this._selectedPoint = null;
            }
        }
    }
    customElements.define('com-sap-sample-sunburst', Sunburst);
})();