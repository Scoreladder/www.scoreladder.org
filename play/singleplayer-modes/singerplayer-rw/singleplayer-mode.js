import { questionBankRw } from "./temporary-question-set-rw.js";

let score = '';

questionBankRw.forEach((question) => {

document.querySelector('.js-card').innerHTML += `
  <div class="question">
    <p>${question.passage}</p>

    <p>${question.question}</p>

    <button class="choice-a" onclick="answerSelected('a', '${question.solution}');">${question.choices.a}</button><br>

    <button class="choice-b" onclick="answerSelected('b', '${question.solution}');">${question.choices.b}</button><br>

    <button class="choice-c" onclick="answerSelected('c', '${question.solution}');">${question.choices.c}</button><br>

    <button class="choice-d" onclick="answerSelected('d', '${question.solution}');">${question.choices.d}</button><br>

    <h1 class="answerResult js-answerResult"></h1>
  </div>`
});

function answerSelected (answer, solution) {

  if (answer === solution) {
    score = 'correct';
  }
  else {
    score = 'incorrect'
  }
  console.log(score);

  document.querySelector(".js-answerResult").innerHTML = score
}

window.answerSelected = answerSelected;