import globals from 'globals';
export default [
  { ignores: ['dist/**', 'node_modules/**', 'reference/**', 'design/**', 'test-results/**'] },
  { files: ['src/**/*.js', 'test/**/*.js', 'scripts/**/*.mjs', '*.js'], languageOptions: { ecmaVersion:'latest', sourceType:'module', globals: {...globals.browser, ...globals.node} }, rules: {
    'no-undef': 'error', 'no-unreachable': 'error', 'no-dupe-keys': 'error', 'no-constant-condition': 'error', 'valid-typeof':'error'
  } }
];
