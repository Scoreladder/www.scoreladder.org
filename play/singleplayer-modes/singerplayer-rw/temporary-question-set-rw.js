export const questionBankRw = [
  {
    id: 1,
    unit: 'Information and Ideas',
    topic: 'main-idea',
    questionType: function getQuestionType(){
      if (this.passage.includes("According to the text")){
        return 'according';
      }
      else if (this.passage.includes("Based on the text")){
        return 'based';
      }
      else if (this.passage.includes("Which choise best states the main idea")){
        return 'main-idea';
      }
      else {
        return 'suggest';
      }
    },
    passage: `Astronomers noticed an eccentricity in the orbit of the planet Mercury which could not be explained by Newton's theory: the perihelion of the orbit was increasing by about 42.98 arcseconds per century. The most obvious explanation for this discrepancy was an as-yet-undiscovered celestial body, such as a planet orbiting the Sun even closer than Mercury, but all efforts to find such a body turned out to be fruitless. In 1915, Albert Einstein developed a theory of general relativity which was able to accurately model Mercury's orbit.`,
    question: `According to the text, what was the initial suspected cause of the discrepancy in Mercury's orbit?`,
    choices: {
      a: 'The presence of an undiscovered celestial body',
      b: 'An error in the measurement of the gravitational constant',
      c: 'A flaw in the theory of general relativity',
      d: 'A miscalculation of the distance between Mercury and the Sun'
    },
    correctAnswer: 'choice-a'
  }
]