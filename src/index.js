import * as Highcharts from 'highcharts';
import 'highcharts/modules/sunburst.js';

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
        }

        /**
         * Specifies which attributes should trigger re-rendering on change.
         * @returns {string[]} An array of observed attribute names.
         */
        static get observedAttributes() {
            return [
                'chartTitle', 'titleSize', 'titleFontStyle', 'titleAlignment', 'titleColor',                // Title properties
                'chartSubtitle', 'subtitleSize', 'subtitleFontStyle', 'subtitleAlignment', 'subtitleColor', // Subtitle properties
                'scaleFormat', 'decimalPlaces'                                                              // Number formatting properties
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
                }
                return;
            }

            const [dimension] = dimensions;
            const [measure] = measures;

            const seriesData = [];

            data.forEach(row => {
                const { id, label, parentId } = row[dimension.key];
                const { raw } = row[measure.key];

                seriesData.push({ 
                    id: id,
                    parent: parentId || '',
                    name: label,
                    value: raw
                });
            });

            console.log('seriesData:', seriesData);

            const scaleFormat = (value) => this._scaleFormat(value);
            const subtitleText = this._updateSubtitle();

            Highcharts.setOptions({
                lang: {
                    thousandsSep: ','
                },
                colors: ['#004b8d', '#47a5dc', '#faa834', '#00aa7e', '#006ac7', '#bf8028', '#00e4a7']
            });

            const chartOptions = {
                chart: {
                    type: 'sunburst',
                    style: {
                        fontFamily: "'72', sans-serif"
                    }
                },
                title: {
                    text: this.chartTitle || "",
                    align: this.titleAlignment || "left",
                    style: {
                        fontSize: this.titleSize || "20px",
                        fontWeight: this.titleFontStyle || "bold",
                        color: this.titleColor || "#333333",
                    },
                },
                subtitle: {
                    text: subtitleText,
                    align: this.subtitleAlignment || "left",
                    style: {
                        fontSize: this.subtitleSize || "12px",
                        fontStyle: this.subtitleFontStyle || "normal",
                        color: this.subtitleColor || "#666666",
                    },
                },
                plotOptions: {
                    series: {
                        cursor: 'pointer'
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
                    allowDrillToNode: true
                }]
            };
            this._chart = Highcharts.chart(this.shadowRoot.getElementById('container'), chartOptions);
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
    }
    customElements.define('com-sap-sample-sunburst', Sunburst);
})();