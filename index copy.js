document.addEventListener('DOMContentLoaded', () => {
  const toggle = document.querySelector('.menu-toggle');
  const nav = document.querySelector('.navegacion');

  if (toggle && nav) {
    toggle.addEventListener('click', () => {
      if (nav.classList.contains('open')) {
        nav.classList.remove('open');
        nav.classList.add('closing');
        nav.addEventListener('animationend', function handler() {
          nav.classList.remove('closing');
          nav.style.display = 'none';
          nav.removeEventListener('animationend', handler);
        });
      } else {
        nav.style.display = 'flex';
        nav.classList.add('open');
      }
    });

    window.addEventListener('resize', () => {
      if (window.innerWidth > 768) {
        nav.style.display = '';
        nav.classList.remove('open', 'closing');
      }
    });
  }

  document.querySelectorAll('.copy-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const text = btn.getAttribute('data-copy');
      if (text) {
        navigator.clipboard.writeText(text);
      }
    });
  });
});

