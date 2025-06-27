
export function scaleValue(value, scaleFormat, decimalPlaces) {
    let scaled = value;
    let suffix = '';

    switch (scaleFormat) {
        case 'k':
            scaled = value / 1000;
            suffix = 'k';
            break;
        case 'm':
            scaled = value / 1_000_000;
            suffix = 'm';
            break;
        case 'b':
            scaled = value / 1_000_000_000;
            suffix = 'b';
            break;
        case 'percent':
            scaled = value * 100;
            suffix = '%';
            break;
        default:
            break;
    }

    return {
        scaledValue: scaled.toFixed(decimalPlaces),
        valueSuffix: suffix
    };
}