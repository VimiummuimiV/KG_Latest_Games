import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { readFileSync, writeFileSync } from 'fs';
import TerserPlugin from 'terser-webpack-plugin';

// Create __dirname for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export default (env = {}, argv) => {
  const isProduction = argv.mode === 'production';
  // Allow override via env.minimize; default to true in production
  const shouldMinimize =
    isProduction && env.minimize !== 'false' && env.minimize !== false;

  // Paths
  const headersPath = resolve(__dirname, 'src/header.js');
  const outputPath = resolve(__dirname, 'dist/KG_Latest_Games.js');

  return {
    mode: isProduction ? 'production' : 'development',
    entry: './src/main.js', // Main script file
    output: {
      path: resolve(__dirname, 'dist'),
      filename: 'KG_Latest_Games.js', // Output file name
    },
    module: {
      rules: [
        // Rule for CSS files
        {
          test: /\.css$/i,
          use: ['style-loader', 'css-loader'],
        },
        // Rule for SCSS/Sass files
        {
          test: /\.s[ac]ss$/i,
          use: [
            'style-loader', // Injects styles into DOM
            'css-loader',   // Turns CSS into CommonJS modules
            'sass-loader',  // Compiles Sass to CSS
          ],
        },
      ],
    },
    optimization: {
      minimize: shouldMinimize, // Conditionally minimize
      minimizer: [new TerserPlugin()],
    },
    stats: 'minimal',
    plugins: [
      {
        apply: (compiler) => {
          compiler.hooks.afterEmit.tap('AppendTampermonkeyHeader', () => {
            try {
              const header = readFileSync(headersPath, 'utf8').trim();
              const script = readFileSync(outputPath, 'utf8');
              writeFileSync(outputPath, `${header}\n\n${script}`);
            } catch (error) {
              console.error('Error appending Tampermonkey headers:', error);
            }
          });
        },
      },
    ],
  };
};
