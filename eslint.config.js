import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'

/*
 * Линтер здесь нужен не ради стиля — за стилем следит взгляд, — а ради двух
 * вещей, на которых мы уже спотыкались.
 *
 * Первая: забытая зависимость useMemo. Список покупок в режиме магазина не
 * пересчитывался после того, как покупки разложили по кладовой, потому что
 * pantry не был в зависимостях. Поймали случайно, глазами. Это ровно то, что
 * react-hooks/exhaustive-deps видит сразу, поэтому здесь он ошибка, а не
 * предупреждение: предупреждения в проекте без линтера копятся молча.
 *
 * Вторая: неиспользованное и случайное any. Первое подсказывает, что правку
 * не довели до конца, второе — что тип потеряли.
 */
export default tseslint.config(
  { ignores: ['dist', 'coverage'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2022,
      globals: { ...globals.browser, ...globals.es2021 },
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      /*
       * Из набора react-hooks берём только два правила, а не весь
       * recommended. В седьмой версии туда добавились проверки под React
       * Compiler — например, «не зови Date.now() при отрисовке», — а у нас
       * есть места, где это сделано намеренно и с объяснением. Линтер,
       * который ругается на осознанное решение, учит не читать линтер.
       */
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'error',
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
      // Подчёркивание — способ сказать «знаю, что не использую»: так пишут
      // пропущенный аргумент, за которым идёт нужный.
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
  {
    // Скрипты сборки живут в Node, а не в браузере
    files: ['*.config.{js,ts}', 'scripts/**/*.mjs', 'server/**/*.mjs'],
    languageOptions: { globals: globals.node },
  },
  {
    // Сервис-воркер живёт в своём мире: ни window, ни document, зато self
    files: ['public/sw.js'],
    languageOptions: { globals: globals.serviceworker },
  },
)
