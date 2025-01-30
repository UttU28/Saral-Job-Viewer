/* clock */
const hours = document.querySelector('.hours');
const minutes = document.querySelector('.minutes');
const seconds = document.querySelector('.seconds');

/* play button */
const play = document.querySelector('.play');
const pause = document.querySelector('.pause');
const playBtn = document.querySelector('.circle__btn');
const wave1 = document.querySelector('.circle__back-1');
const wave2 = document.querySelector('.circle__back-2');

/* rate slider */
const container = document.querySelector('.slider__box');
const btn = document.querySelector('.slider__btn');
const color = document.querySelector('.slider__color');
const tooltip = document.querySelector('.slider__tooltip');

let clock = () => {
  let today = new Date();
  let h = (today.getHours() % 12) + today.getMinutes() / 59;
  let m = today.getMinutes();
  let s = today.getSeconds();

  h *= 30;
  m *= 6;
  s *= 6;

  rotation(hours, h);
  rotation(minutes, m);
  rotation(seconds, s);

  // call every second
  setTimeout(clock, 500);
};

let rotation = (target, val) => {
  target.style.transform = `rotate(${val}deg)`;
};

let onMouseMove = (e) => {
  e.preventDefault();
  let targetRect = container.getBoundingClientRect();
  let x = e.pageX - targetRect.left + 10;
  if (x > targetRect.width) { x = targetRect.width };
  if (x < 0) { x = 0 };
  btn.x = x - 10;
  btn.style.left = btn.x + 'px';

  let percentPosition = (btn.x + 10) / targetRect.width * 100;

  color.style.width = percentPosition + "%";

  tooltip.style.left = btn.x - 5 + 'px';
  tooltip.style.opacity = 1;

  tooltip.textContent = Math.round(percentPosition) + '%';
};

let onMouseUp = (e) => {
  window.removeEventListener('mousemove', onMouseMove);
  tooltip.style.opacity = 0;

  btn.addEventListener('mouseover', function () {
    tooltip.style.opacity = 1;
  });

  btn.addEventListener('mouseout', function () {
    tooltip.style.opacity = 0;
  });
};

dragElement(container, btn);

/* play button */
playBtn.addEventListener('click', function (e) {
  e.preventDefault();
  pause.classList.toggle('visibility');
  play.classList.toggle('visibility');
  playBtn.classList.toggle('shadow');
  wave1.classList.toggle('paused');
  wave2.classList.toggle('paused');
});

// Start the clock
clock();
