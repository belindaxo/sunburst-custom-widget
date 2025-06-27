export function processSeriesData(data, dimensions, measure) {
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