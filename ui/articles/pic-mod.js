function gcd(a, b) {
    while (b) {
        a %= b;
        [a, b] = [b, a];
    }
    return a;
}

function isPrime(num) {
    if (num <= 1) return false;
    if (num <= 3) return true;
    if (num % 2 === 0 || num % 3 === 0) return false;
    for (let i = 5; i * i <= num; i += 6) {
        if (num % i === 0 || num % (i + 2) === 0) return false;
    }
    return true;
}

function modInverse(e, phi) {
    let m0 = phi, t, q;
    let x0 = 0, x1 = 1;
    if (phi === 1) return 0;
    while (e > 1) {
        q = Math.floor(e / phi);
        t = phi;
        phi = e % phi, e = t;
        t = x0;
        x0 = x1 - q * x0;
        x1 = t;
    }
    if (x1 < 0) x1 += m0;
    return x1;
}

function modPow(base, exp, mod) {
    let res = 1n;
    base = BigInt(base) % BigInt(mod);
    exp = BigInt(exp);
    mod = BigInt(mod);
    while (exp > 0n) {
        if (exp % 2n === 1n) res = (res * base) % mod;
        base = (base * base) % mod;
        exp = exp / 2n;
    }
    return res;
}

function uniqueCountFor(n, g) {
    const values = new Set();
    for (let x = 1; x <= n; x++) {
        values.add(modPow(g, x, n));
    }
    return values.size;
}

// 2D array: each row starts with n, followed by counts for g = 2..7
const gammanData = [];

for (let n = 9; n <= 99; n+=2) {
    const row = [n];
    for (let g = 2; g <= 7; g++) {
        row.push(uniqueCountFor(n, g));
    }
    gammanData.push(row);
}

function plotGammaN(opts) {
    opts = opts || {};
    var containerId = opts.containerId || 'gammanplot';
    var tooltipId   = opts.tooltipId   || 'tooltip';
    var onSelect    = opts.onSelect    || function() {};
    var isDark      = opts.isDark      || false;
    var fg          = isDark ? 'rgba(236,226,200,0.7)'  : '#555';
    var fgFaint     = isDark ? 'rgba(236,226,200,0.35)' : '#aaa';

    const chartsContainer = document.getElementById(containerId);
    chartsContainer.innerHTML = '';

    const gValues = [2, 3, 4, 5, 6, 7];
    // Only g=2 visible by default
    const active = new Set([2]);

    const series = gValues.map((g, index) => ({
        g,
        values: gammanData.map(row => ({
        n: row[0],
        value: row[index + 1] / (row[0] - 1)
        }))
    }));

    const card = document.createElement('div');
    card.className = 'chart-card';

    // const title = document.createElement('h3');
    // title.textContent = 'Normalized unique count for g = 2..7';
    // card.appendChild(title);

    const chartDiv = document.createElement('div');
    chartDiv.className = 'chart';
    card.appendChild(chartDiv);

    chartsContainer.appendChild(card);

    const width = 960;
    const height = 520;
    const margin = { top: 20, right: 120, bottom: 50, left: 55 };
    const innerWidth = width - margin.left - margin.right;
    const innerHeight = height - margin.top - margin.bottom;

    const svg = d3.select(chartDiv)
        .append('svg')
        .attr('viewBox', `0 0 ${width} ${height}`)
        .attr('preserveAspectRatio', 'xMidYMid meet');

    const plot = svg.append('g')
        .attr('transform', `translate(${margin.left},${margin.top})`);

    const xScale = d3.scaleLinear()
        .domain(d3.extent(gammanData, d => d[0]))
        .range([0, innerWidth]);

    const yScale = d3.scaleLinear()
        .domain([0, 1])
        .range([innerHeight, 0]);

    const xGrid = d3.axisBottom(xScale)
        .tickSize(-innerHeight)
        .tickFormat('');

    const yGrid = d3.axisLeft(yScale)
        .tickSize(-innerWidth)
        .tickFormat('');

    // plot.append('g')
    //     .attr('class', 'grid')
    //     .attr('transform', `translate(0,${innerHeight})`)
    //     .call(xGrid);

    // plot.append('g')
    //     .attr('class', 'grid')
    //     .call(yGrid);

    const line = d3.line()
        .x(d => xScale(d.n))
        .y(d => yScale(d.value));

    const primes = gammanData.map(d => d[0]).filter(isPrime);

    // vertical lines for primes
    plot.append('g')
        .selectAll('line')
        .data(primes)
        .enter()
        .append('line')
        .attr('x1', d => xScale(d))
        .attr('x2', d => xScale(d))
        .attr('y1', 0)
        .attr('y2', innerHeight)
        .attr('stroke', 'green')
        .attr('stroke-width', 4)
        .attr('opacity', 0.2);

    const color = d3.scaleOrdinal()
        .domain(gValues)
        .range(d3.schemeTableau10);

    const seriesGroup = plot.append('g');
    const tooltip = d3.select('#' + tooltipId);

    const lineGroups = seriesGroup.selectAll('.series-line')
        .data(series)
        .enter()
        .append('path')
        .attr('class', 'series-line')
        .attr('fill', 'none')
        .attr('stroke', d => color(d.g))
        .attr('stroke-width', 2)
        .attr('d', d => line(d.values));

    const pointGroups = seriesGroup.selectAll('.series-points')
        .data(series)
        .enter()
        .append('g')
        .attr('class', 'series-points');

    function updateSelectionFields(d) {
        onSelect(d);
    }

    pointGroups.selectAll('circle')
        .data(d => d.values.map(v => ({ ...v, g: d.g })))
        .enter()
        .append('circle')
        .attr('cx', d => xScale(d.n))
        .attr('cy', d => yScale(d.value))
        .attr('r', 3)
        .attr('fill', d => color(d.g))
        .attr('stroke', '#fff')
        .attr('stroke-width', 1)
        .on('mouseenter', function(event, d) {
            d3.select(this).attr('r', 5);
            tooltip
                .style('display', 'block')
                .html(
                `<strong>g = ${d.g}</strong><br>` +
                `n = ${d.n}<br>` +
                `value = ${d.value.toFixed(4)}`
                );
        })
        .on('mousemove', function(event) {
            tooltip
                .style('left', `${event.pageX + 12}px`)
                .style('top', `${event.pageY - 28}px`);
        })
        .on('mouseleave', function() {
            d3.select(this).attr('r', 3);
            tooltip.style('display', 'none');
        })
        .on('click', function(event, d) {
            updateSelectionFields(d);
        });

    plot.append('g')
        .attr('class', 'axis')
        .attr('transform', `translate(0,${innerHeight})`)
        .call(d3.axisBottom(xScale))
        .style('color', fg);

    plot.append('g')
        .attr('class', 'axis')
        .call(d3.axisLeft(yScale))
        .style('color', fg);

    svg.append('text')
        .attr('class', 'axis-label')
        .attr('x', margin.left + innerWidth / 2)
        .attr('y', height - 10)
        .attr('text-anchor', 'middle')
        .attr('fill', fg)
        .text('n');

    svg.append('text')
        .attr('class', 'axis-label')
        .attr('transform', `translate(16, ${margin.top + innerHeight / 2}) rotate(-90)`)
        .attr('text-anchor', 'middle')
        .attr('fill', fg)
        .text('𝛾');

    const legend = svg.append('g')
        .attr('transform', `translate(${width - margin.right + 20}, ${margin.top + 10})`);

    function refreshVisibility() {
        lineGroups
        .attr('display', d => active.has(d.g) ? null : 'none')
        .attr('opacity', d => active.has(d.g) ? 1 : 0.15);

        pointGroups
        .attr('display', d => active.has(d.g) ? null : 'none')
        .attr('opacity', d => active.has(d.g) ? 1 : 0.15);

        legend.selectAll('.legend-item').each(function(g) {
        const item = d3.select(this);
        const isActive = active.has(g);
        item.select('line').attr('opacity', isActive ? 1 : 0.25);
        item.select('text').attr('opacity', isActive ? 1 : 0.4);
        });
    }

    const legendItems = legend.selectAll('.legend-item')
        .data(gValues)
        .enter()
        .append('g')
        .attr('class', 'legend-item')
        .attr('transform', (g, i) => `translate(0, ${i * 24})`)
        .on('click', function(event, g) {
        if (active.has(g)) {
            active.delete(g);
        } else {
            active.add(g);
        }
        refreshVisibility();
        });

    legendItems.append('line')
        .attr('x1', 0)
        .attr('x2', 24)
        .attr('y1', 0)
        .attr('y2', 0)
        .attr('stroke', g => color(g))
        .attr('stroke-width', 3);

    legendItems.append('text')
        .attr('x', 32)
        .attr('y', 4)
        .attr('fill', fg)
        .text(g => `g = ${g}`);

    refreshVisibility();
}

// Continuous vs discrete nature of the DLP: a line plot of g^x next to a
// scatter of g^x mod n, both for g=2, n=11 and x = 1..10.
function plotLogDLP(opts) {
    opts = opts || {};
    var containerId = opts.containerId || 'log-dlp';
    var isDark = opts.isDark || false;
    var fg     = isDark ? 'rgba(236,226,200,0.7)'  : '#555';
    var accent = isDark ? '#d6ab5e' : '#c0521a';

    var container = document.getElementById(containerId);
    if (!container) return;
    container.innerHTML = '';

    var g = 2, n = 19;
    var xs = d3.range(1, 19); // x = 1..18
    var contData = xs.map(function(x) { return { x: x, y: Math.pow(g, x) }; });
    var discData = xs.map(function(x) { return { x: x, y: Number(modPow(g, x, n)) }; });

    var panelW = 420, panelH = 340;
    var margin = { top: 26, right: 18, bottom: 46, left: 58 };
    var innerW = panelW - margin.left - margin.right;
    var innerH = panelH - margin.top - margin.bottom;

    // Each panel is its own SVG so CSS (.log-dlp-fig) can lay them out side by
    // side on wide screens and stack them on narrow ones.
    var fig = d3.select(container).append('div').attr('class', 'log-dlp-fig');

    function panel(data, yMax, drawLine, mod) {
        var svg = fig.append('div').attr('class', 'log-dlp-panel').append('svg')
            .attr('viewBox', '0 0 ' + panelW + ' ' + panelH)
            .attr('preserveAspectRatio', 'xMidYMid meet');

        var t = svg.append('text')
            .attr('class', 'axis-label')
            .attr('x', margin.left + innerW / 2)
            .attr('y', 14)
            .attr('text-anchor', 'middle')
            .attr('fill', fg);
        t.append('tspan').text('X = g');
        t.append('tspan').attr('dy', '-6').attr('font-size', '0.72em').text('x');
        t.append('tspan').attr('dy', '6').text(mod ? ' mod n' : '');

        var pg = svg.append('g')
            .attr('transform', 'translate(' + margin.left + ',' + margin.top + ')');
        var xScale = d3.scaleLinear().domain([0, 18]).range([0, innerW]);
        var yScale = d3.scaleLinear().domain([0, yMax]).nice().range([innerH, 0]);

        pg.append('g')
            .attr('transform', 'translate(0,' + innerH + ')')
            .call(d3.axisBottom(xScale).ticks(9))
            .style('color', fg);
        pg.append('g')
            .call(d3.axisLeft(yScale).ticks(6))
            .style('color', fg);

        if (drawLine) {
            var lineGen = d3.line()
                .x(function(d) { return xScale(d.x); })
                .y(function(d) { return yScale(d.y); });
            pg.append('path').datum(data)
                .attr('fill', 'none').attr('stroke', accent).attr('stroke-width', 2)
                .attr('d', lineGen);
        }
        pg.selectAll('circle').data(data).enter().append('circle')
            .attr('cx', function(d) { return xScale(d.x); })
            .attr('cy', function(d) { return yScale(d.y); })
            .attr('r', 3.5).attr('fill', accent);

        svg.append('text')
            .attr('class', 'axis-label')
            .attr('x', margin.left + innerW / 2)
            .attr('y', panelH - 10)
            .attr('text-anchor', 'middle')
            .attr('fill', fg)
            .text('x');
    }

    panel(contData, Math.pow(g, 18), true, false);
    panel(discData, n - 1, false, true);
}