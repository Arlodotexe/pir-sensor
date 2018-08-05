const path = require('path');

module.exports = {
    target: 'node',
    mode: 'development',
    entry: './node.js',
    output: {
        filename: 'node.js',
        path: path.resolve(__dirname, 'dist')
    },
    module: {
        rules: [
            {
                test: /\.js$/,
                use: {
                    loader: 'babel-loader',
                    options: {
                        "presets": ["@babel/preset-env"]
                    }
                }
            }
        ]
    }
};
