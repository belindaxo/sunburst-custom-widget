/**
 * Determines subtitle text based on scale format or user input.
 * @param {string} chartSubtitle - The user-defined subtitle for the chart.
 * @param {string} scaleFormat - The scale format used in the chart (e.g., 'k', 'm', 'b').
 * @returns {string} The subtitle text.
 */
export function updateSubtitle(chartSubtitle, scaleFormat) {
    if (chartSubtitle || chartSubtitle.trim() === '') {
        let subtitleText = '';
        switch (scaleFormat) {
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
        return chartSubtitle;
    }
}

/**
 * Updates the chart title based on the auto-generated title or user-defined title.
 * @param {string} autoTitle - Automatically generated title based on series and dimensions.
 * @param {string} chartTitle - User-defined title for the chart.
 * @returns {string} The title text.
 */
export function updateTitle(autoTitle, chartTitle) {
    if (!chartTitle || chartTitle === '') {
        return autoTitle;
    } else {
        return chartTitle;
    }
}

export function generateLevels(rootLevel, totalLevels) {
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