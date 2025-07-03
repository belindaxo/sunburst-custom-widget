import * as Highcharts from 'highcharts';
import 'highcharts/modules/sunburst.js';
import 'highcharts/modules/exporting';
import 'highcharts/modules/drilldown';
import { parseMetadata } from './data/metadataParser.js';
import { processSeriesData } from './data/dataProcessor.js';
import { updateTitle, updateSubtitle, generateLevels } from './config/chartUtils.js';
import { applyHighchartsDefaults, overrideContextButtonSymbol } from './config/highchartsSetup.js';
import { createChartStylesheet } from './config/styles.js';
import { scaleValue } from './formatting/scaleFormatter.js';
import { formatTooltip } from './formatting/tooltipFormatter.js';

(function () {
    class Sunburst extends HTMLElement {
        constructor() {
            super();
            this.attachShadow({ mode: 'open' });

            // Apply the stylesheet to the shadow DOM
            this.shadowRoot.adoptedStyleSheets = [createChartStylesheet()];

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
                'scaleFormat', 'decimalPlaces', 'topN',                                                             // Number formatting properties
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

            const seriesData = processSeriesData(data, dimensions, measure);
            console.log('processSeriesData - seriesData:', seriesData);

            const seriesName = measures[0]?.label || 'Value';

            const dimDescriptions = dimensions.map(dim => {
                const dimDescription = dim.description || 'Dimension Description';
                return dimDescription;
            });

            const dimPart = dimDescriptions.join(', ');

            const autoTitle = `${seriesName} per ${dimPart}`;

            const totalLevels = dimensions.length + 1;

            const levels = generateLevels(1, totalLevels);
            console.log('generateLevels - Levels:', levels);

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

            const scaleFormat = (value) => scaleValue(value, this.scaleFormat, this.decimalPlaces);
            const subtitleText = updateSubtitle(this.chartSubtitle, this.scaleFormat);
            const titleText = updateTitle(autoTitle, this.chartTitle);

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

            const leafTotals = new Map();
            seriesData.forEach(node => {
                if (node.id !== 'Root' && node.value) {
                    leafTotals.set(node.id, node.value);
                }
            });
            console.log('Leaf totals map:', leafTotals);

            const topN = parseInt(this.topN);
            if (!isNaN(topN) && topN > 0) {
                const sortedNodes = Array.from(leafTotals.entries()).sort((a, b) => b[1] - a[1]).slice(0, topN).map(entry => entry[0]);
                console.log('sortedNodes:', sortedNodes);

                seriesData = sortedNodes;
            }

    


            // Global Configuration
            applyHighchartsDefaults();
            overrideContextButtonSymbol();

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
                                if (this._selectedPoint) {
                                    this._selectedPoint.select(false, false);
                                    this._selectedPoint = null;
                                }
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
                                    const chart = clickedPoint.series.chart;
                                    const series = chart.series[0];
                                    const rootId = series.rootNode;
                                    const rootNode = series.nodeMap[rootId];

                                    const rootLevel = (rootNode?.id === '') ? 1 : (rootNode.level);
                                    console.log('point.events.click - New root level:', rootLevel);

                                    const newLevels = generateLevels(rootLevel, totalLevels);
                                    series.update({
                                        levels: newLevels
                                    });

                                    // FILTERING LOGIC
                                    const linkedAnalysis = this.dataBindings.getDataBinding('dataBinding').getLinkedAnalysis();
                                    if (!linkedAnalysis) return;

                                    if (clickedPoint.node.isLeaf) {
                                        console.log('point.events.click - Leaf node clicked:', clickedPoint.name);

                                        if (this._selectedPoint && this._selectedPoint !== clickedPoint) {
                                            this._selectedPoint.select(false, false);
                                        }
                                        clickedPoint.select(true, false);
                                        this._selectedPoint = clickedPoint;

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
                                        linkedAnalysis.removeFilters();
                                        return;
                                    }

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
                    formatter: formatTooltip(scaleFormat)
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
                                const rootLevel = (newLevel === 0) ? 1 : newLevel;
                                console.log('Breadcrumbs - New root level:', rootLevel);
                                const newLevels = generateLevels(rootLevel, totalLevels);
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
                                    linkedAnalysis.removeFilters();
                                    return;
                                }

                                // Remove existing filters before applying new ones
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

        // SAC Scripting Methods

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