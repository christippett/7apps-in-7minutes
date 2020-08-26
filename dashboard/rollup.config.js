import commonjs from '@rollup/plugin-commonjs'
import resolve from '@rollup/plugin-node-resolve'

export default {
  input: 'src/static/js/main.js',
  output: {
    file: 'src/static/js/7apps-bundle.js',
    format: 'iife',
    globals: {
      window: 'window',
      document: 'document'
    }
  },
  plugins: [resolve(), commonjs()],
  external: ['window', 'document']
}
