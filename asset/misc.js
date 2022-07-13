function inputChange(event) {
    let select = document.getElementById('group');
    console.log(select.value)
    let name = select.value
    console.log(event)
    console.log('https://raw.githubusercontent.com/yayoimizuha/youtube-viewcount-logger-python/master/tsvs/' + name + '.tsv');
    document.getElementById('plot').innerHTML = '';
    data_list = []
    fetch('https://raw.githubusercontent.com/yayoimizuha/youtube-viewcount-logger-python/master/tsvs/' + name + '.tsv')
        .then(response => response.text())
        .then(data => {
            //console.debug(data);
            let proceed_data = process_csv(data);
            GraphPlot(proceed_data[0], proceed_data[1]);
            proceed_data = [];
        })

}

function initPullDownList(data) {
    let rows = data.split(/\r\n|\n/);
    let PullDownElement = document.getElementById('group');
    for (let i = 0; i < rows.length - 1; i++) {
        PullDownElement.insertAdjacentHTML('beforeend', `<option value="${rows[i]}">${rows[i]}</option>`);
    }
}

window.addEventListener('DOMContentLoaded', () => {
    fetch('https://raw.githubusercontent.com/yayoimizuha/youtube-viewcount-logger-python/master/tsvs/モーニング娘。.tsv')
        .then(response => response.text())
        .then(data => {
            //console.debug(data);
            let proceed_data = process_csv(data);
            GraphPlot(proceed_data[0], proceed_data[1]);
            proceed_data = [];
        });
    fetch('https://raw.githubusercontent.com/yayoimizuha/youtube-viewcount-logger-python/master/tsvs/group_list.tsv')
        .then(response => response.text())
        .then(data => {
            //console.debug(data);
            initPullDownList(data);
        })
});

let data_list = [];

function process_csv(raw) {
    let rows = raw.split(/\r\n|\n/);
    console.log(rows.length);
    for (let i = 1; i < rows.length - 1; i++) {
        //console.log(rows[i].split('\t'));

        let x_data = rows[0].split('\t');
        x_data.splice(0, 2);
        let y_data = rows[i].split('\t');
        y_data.splice(0, 2);
        for (let j = 0; j < y_data.length; j++) {
            if (y_data[j] === "0") {
                y_data[j] = NaN;
            } else {
                y_data[j] = parseInt(y_data[j]);
            }
        }
        let hover_label = [];
        hover_label[0] = y_data[0];
        for (let j = 1; j < y_data.length; j++) {
            //console.debug(typeof y_data[1])
            hover_label.push(y_data[j] - y_data[j - 1]);
        }
        let song_name = rows[i].split('\t')[1];
        if (isNaN(y_data[y_data.length - 1])) continue;
        data_list.push({
            x: x_data,
            y: y_data,
            text: hover_label,
            name: song_name,
            connectgaps: true,
            hovertemplate: '<b>' + song_name + '</b>%{x} \+%{text}<extra></extra>'
        })
    }
    console.log(data_list[0]);
    let before_date = data_list[0].x[0];
    let after_date = data_list[0].x[data_list[0].x.length - 1];
    console.log(before_date, after_date);
    let dateDelta = dayjs(after_date).diff(dayjs(before_date), 'day', false);
    console.debug(dateDelta);
    const layout = {
        title: document.getElementById('group').value,
        hovermode: 'closest',
        xaxis: {
            tickformat: '%Y年%m月%d日',
            showspikes: true,
            autorange: false,
            range: [dayjs(before_date).subtract(Math.floor(dateDelta / 20), 'day').format('YYYY-MM-DD'),
                dayjs(after_date).add(Math.floor(dateDelta / 20), 'day').format('YYYY-MM-DD')],

        },
        yaxis: {
            showspikes: true,
        }
    };

    console.log(layout);
    return [data_list, layout]
}

function GraphPlot(data, layout) {
    Plotly.newPlot('plot', data, layout, {
        locale: 'ja',
        responsive: true,
        toImageButtonOptions: {
            format: 'svg',
            filename: document.getElementById('group').value,
            height: 2160,
            width: 3840,
            scale: 1,
            displayModeBar: true,
        }
    });
}
