import { questionBankRw } from "./temporary-question-set-rw.js";

questionBankRw.forEach((question) => {

document.querySelector('.js-card').innerHTML = `
  <div class="question">
    <p>${question.passage}</p>

    <p>${question.question}</p>

    <button class="choice-a">${question.choices.a}</button><br>

    <button class="choice-b">${question.choices.b}</button><br>

    <button class="choice-c">${question.choices.c}</button><br>

    <button class="choice-d">${question.choices.d}</button><br>
  </div>`
});