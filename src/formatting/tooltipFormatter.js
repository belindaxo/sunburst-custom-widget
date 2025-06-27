import * as Highcharts from 'highcharts';

/**
 * Formats the tooltip content for the chart.
 * @param {Function} scaleFormat - A function to scale and format the value.
 * @returns {Function} A function that formats the tooltip content.
 */
export function formatTooltip(scaleFormat) {
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