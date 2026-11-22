/* global module */
module.exports = {
  content: { relative: true, files: ['./src/**/*.{html,ts}'] },
  theme: {
    extend: {
      colors: {
        ivory: '#F7F5EF',
        card: '#FFFFFF',
        evergreen: '#183F35',
        charcoal: '#202925',
        muted: '#626B65',
        sage: '#E8EEE7',
        bronze: '#866536',
        borderSoft: '#DDDAD1',
      },
      fontFamily: {
        serif: ['Playfair Display', 'Georgia', 'serif'],
        sans: ['Manrope', 'sans-serif'],
      },
      borderRadius: { custom: '16px' },
    },
  },
};
