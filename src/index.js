import * as Highcharts from 'highcharts';
import 'highcharts/modules/sunburst.js';
import 'highcharts/modules/exporting';
import 'highcharts/modules/drilldown';
import 'highcharts/modules/export-data';

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
            let total = 0;

            data.forEach(row => {
                let parentId = 'Root'; // Start with a root parent ID
                let pathId = '';

                dimensions.forEach((dim, level) => {
                    const value = row[dim.key].label || `Unknown-${level}`;
                    pathId += (pathId ? '/' : '') + value;

                    if (!nodeMap.has(pathId)) {
                        nodeMap.set(pathId, true);

                        const node = {
                            id: pathId,
                            parent: parentId,
                            name: value,
                            description: dim.description || '',
                        };

                        // Assign value only on the leaf level
                        if (level === dimensions.length - 1) {
                            const val = row[measure.key].raw ?? 0;
                            node.value = val;
                            total += val; // Accumulate total value
                        }

                        seriesData.push(node);
                    }

                    parentId = pathId; // Update parentId for the next level
                });
            });

            const rootNode = {
                id: 'Root',
                parent: '',
                name: measure.label,
                description: '',
                value: total, // Set the total value for the root node
            };

            // Add the root node to the series data
            seriesData.unshift(rootNode);
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

            const seriesData = this._processSeriesData(data, dimensions, measure);
            console.log('_processSeriesData - seriesData:', seriesData);

            const seriesName = measures[0]?.label || 'Value';

            const dimDescriptions = dimensions.map(dim => {
                const dimDescription = dim.description || 'Dimension Description';
                return dimDescription;
            });

            const dimPart = dimDescriptions.join(', ');

            const autoTitle = `${seriesName} per ${dimPart}`;

            const totalLevels = dimensions.length + 1;

            const levels = this._generateLevels(1, totalLevels);
            console.log('_generateLevels - Levels:', levels);

            const validCategoryNames = seriesData.filter(node => node.parent === 'Root').map(node => node.name) || [];
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

            seriesData.forEach(node => {
                if (node.id === 'Root') {
                    node.color = '#ffffff'; // Root node color
                    return;
                }
                if (node.parent === 'Root') {
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

            console.log('seriesData with colors added:', seriesData);

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
                    },
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
                                }
                                this._selectedPoint = null;
                                this._renderChart(); // Re-render the chart to reset the state
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
                                click: (event) => {
                                    const clickedPoint = event.point;
                                    console.log('point.events.click - clickedPoint:', clickedPoint);
                                    console.log('point.events.click - clickedPoint.id:', clickedPoint.id);
                                    const chart = clickedPoint.series.chart;
                                    const series = chart.series[0];
                                    const rootId = series.rootNode;
                                    const rootNode = series.nodeMap[rootId];
                                    console.log('point.events.click - rootId:', rootId);
                                    console.log('point.events.click - rootNode:', rootNode);

                                    const rootLevel = (rootNode?.id === '') ? 1 : (rootNode.level);
                                    console.log('point.events.click - New root level:', rootLevel);

                                    const newLevels = this._generateLevels(rootLevel, totalLevels);
                                    series.update({
                                        levels: newLevels
                                    });

                                    // FILTERING LOGIC
                                    const linkedAnalysis = this.dataBindings.getDataBinding('dataBinding').getLinkedAnalysis();
                                    if (!linkedAnalysis) return;

                                    if (clickedPoint.node.isLeaf) {
                                        console.log('point.events.click - Leaf node clicked:', clickedPoint.name);
                                        const labels = clickedPoint.id.split('/');
                                        const selection = {};
                                        labels.forEach((label, index) => {
                                            const dim = dimensions[index];
                                            const matchingRow = data.find((item) => item[dim.key]?.label === label);
                                            if (dim && matchingRow) {
                                                selection[dim.id] = matchingRow[dim.key].id;
                                            }
                                        });

                                        // linkedAnalysis.removeFilters();
                                        console.log('point.events.click - Leaf Selection:', selection);
                                        linkedAnalysis.setFilters(selection);
                                        return;
                                    }

                                    if (rootLevel === 1) {
                                        console.log('point.events.click - Removing filters for root level');
                                        linkedAnalysis.removeFilters();
                                        return;
                                    }

                                    // Remove existing filters before applying new ones
                                    // console.log('point.events.click - Removing existing filters');
                                    // linkedAnalysis.removeFilters();

                                    const labels = rootId.split('/');
                                    const selection = {};
                                    labels.forEach((label, index) => {
                                        const dim = dimensions[index];
                                        const matchingRow = data.find((item) => item[dim.key]?.label === label);
                                        if (dim && matchingRow) {
                                            selection[dim.id] = matchingRow[dim.key].id;
                                        }
                                    });
                                    console.log('point.events.click - Selection:', selection);

                                    linkedAnalysis.setFilters(selection);
                                }
                            },
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
                    data: seriesData,
                    allowTraversingTree: true,
                    levels: levels,
                    breadcrumbs: {
                        events: {
                            click: function (button, breadcrumbs) {
                                console.log('Breadcrumbs button:', button);
                                console.log('Breadcrumbs object class:', breadcrumbs);
                                const chart = this._chart;
                                const series = chart.series[0];
                                const newLevel = breadcrumbs.level;
                                console.log('Breadcrumbs - breadcrumbs.level:', newLevel);
                                const rootLevel = (newLevel === 0) ? 1 : newLevel;
                                console.log('Breadcrumbs - New root level:', rootLevel);
                                const newLevels = this._generateLevels(rootLevel, totalLevels);
                                console.log('Breadcrumbs - New levels:', newLevels);
                                series.update({
                                    levels: newLevels
                                });

                                // FILTERING LOGIC
                                const rootId = breadcrumbs.levelOptions.id;
                                console.log('Breadcrumbs - rootId:', rootId);
                                const linkedAnalysis = this.dataBindings.getDataBinding('dataBinding').getLinkedAnalysis();
                                if (!linkedAnalysis) return;

                                if (rootLevel === 1) {
                                    console.log('Breadcrumbs - Removing filters for root level');
                                    linkedAnalysis.removeFilters();
                                    return;
                                }

                                // Remove existing filters before applying new ones
                                console.log('Breadcrumbs - Removing existing filters');
                                linkedAnalysis.removeFilters();

                                const labels = rootId.split('/');
                                console.log('Breadcrumbs - Labels:', labels);
                                const selection = {};
                                labels.forEach((label, index) => {
                                    const dim = dimensions[index];
                                    const matchingRow = data.find((item) => item[dim.key]?.label === label);
                                    if (dim && matchingRow) {
                                        selection[dim.id] = matchingRow[dim.key].id;
                                    }
                                });
                                console.log('Breadcrumbs - Selection:', selection);

                                linkedAnalysis.setFilters(selection);
                            }.bind(this)
                        }
                    }
                }]
            };
            this._chart = Highcharts.chart(this.shadowRoot.getElementById('container'), chartOptions);

            const container = this.shadowRoot.getElementById('container');

            container.addEventListener("mouseenter", () => {
                if (this._chart) {
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
                    );
                }
            });

            container.addEventListener("mouseleave", () => {
                if (this._chart) {
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
                }
            });
        }

        _generateLevels(rootLevel, totalLevels) {
            const levels = [];

            // Add Root Node level
            levels.push({
                level: 1,
                dataLabels: {
                    enabled: false
                }
            });

            // Add real data levels, starting from 2
            for (let i = 2; i <= totalLevels; i++) {
                const show = i >= rootLevel && i <= rootLevel + 2;

                levels.push({
                    level: i,
                    levelSize: {
                        value: show ? 1 : 0
                    },
                    dataLabels: {
                        enabled: show,
                        style: {
                            fontWeight: 'normal'
                        }
                    },
                    ...(i === 2 ? { colorByPoint: true } : {
                        colorVariation: {
                            key: 'brightness',
                            to: (i % 2 === 0 ? -0.5 : 0.5)
                        }
                    })
                });
            }

            return levels;
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
                if (this.point) {
                    // Retrieve the category data using the index
                    const name = this.point.name;
                    const description = this.point.description || '';
                    const { scaledValue, valueSuffix } = scaleFormat(this.point.value);
                    const value = Highcharts.numberFormat(scaledValue, -1, '.', ',');
                    const valueWithSuffix = `${value} ${valueSuffix}`;
                    if (this.point.id === 'Root') {
                        return `
                        <div style="text-align: left; font-family: '72', sans-serif; font-size: 14px;">
                        <div style="font-size: 14px; font-weight: normal; color: #666666;">${this.series.name}</div>
                            <div style="font-size: 18px; font-weight: normal; color: #000000;">${valueWithSuffix}</div>
                        </div>
                    `;
                    } else {
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
                    }
                } else {
                    return 'error with data';
                }
            };
        }

        getSunburstMembers() {
            const dataBinding = this.dataBindings.getDataBinding('dataBinding');
            const members = dataBinding.getMembers('measures');
            return members;
        }

        getSunburstDimensions() {
            const dataBinding = this.dataBindings.getDataBinding('dataBinding');
            const dimensions = dataBinding.getDimensions('dimensions');
            return dimensions;
        }

        removeSunburstMember(memberId) {
            const dataBinding = this.dataBindings.getDataBinding('dataBinding');
            dataBinding.removeMember(memberId);
            console.log('removeSunburstMember - memberId:', memberId);
        }

        removeSunburstDimension(dimensionId) {
            const dataBinding = this.dataBindings.getDataBinding('dataBinding');
            dataBinding.removeDimension(dimensionId);
            console.log('removeSunburstDimension - dimensionId:', dimensionId);
        }

        addSunburstMember(memberId) {
            const dataBinding = this.dataBindings.getDataBinding('dataBinding');
            dataBinding.addMemberToFeed('measures', memberId);
            console.log('addSunburstMember - memberId:', memberId);
        }

        addSunburstDimension(dimensionId) {
            const dataBinding = this.dataBindings.getDataBinding('dataBinding');
            dataBinding.addDimensionToFeed('dimensions', dimensionId);
            console.log('addSunburstDimension - dimensionId:', dimensionId);
        }

    }
    customElements.define('com-sap-sample-sunburst', Sunburst);
})();