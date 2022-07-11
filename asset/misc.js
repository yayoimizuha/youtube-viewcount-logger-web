function inputChange(event) {
    let select = document.getElementById('group');
    console.log(select.value)
    let name = select.value
    console.log(event)

}

window.addEventListener('DOMContentLoaded', () => {
    fetch('asset/save.tsv')
        .then(response => response.text())
        .then(data => {
            console.log(data);
            process_csv(data);
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
        data_list.push({
            x: x_data,
            y: y_data,
            text: hover_label,
            name: song_name,
            connectgaps: true,
            hovertemplate: '<b>' + song_name + '</b> \+%{text}<extra></extra>'
        })
    }
    console.log(data_list);
    let layout = {
        title: 'モーニング娘。'
    }
    Plotly.newPlot('plot', data_list, layout);
}