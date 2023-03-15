
import React, { Component } from 'react';
import PropTypes from 'prop-types';
import { Loading } from 'react-simple-chatbot';

import Speech from 'speak-tts'


const CONFIDENTIAL = "[CONFIDENTIAL]";
const speech = new Speech()
require('dotenv').config()


const { Configuration, OpenAIApi } = require("openai");
const neo4j = require('neo4j-driver')

const driver = neo4j.driver(process.env.REACT_APP_NEO4JURI, neo4j.auth.basic(process.env.REACT_APP_NEO4JUSER, process.env.REACT_APP_NEO4JPASSWORD))

const session = driver.session({database:process.env.REACT_APP_NEO4JDATABASE || 'neo4j'})




const configuration = new Configuration({
  apiKey: process.env.REACT_APP_API_KEY
});

const openai = new OpenAIApi(configuration);


speech.init({
  'volume': 1,
  'lang': 'en-GB',
  'rate': 1,
  'pitch': 1,
  'voice': 'Google UK English Male',
  'splitSentences': true,
  'listeners': {
    'onvoiceschanged': (voices) => {
      console.log("Event voiceschanged", voices)
    }
  }
})

class MoviesBot extends Component {
  constructor(props) {
    super(props);

    this.state = {
      loading: true,
      result: ''
    };

    this.triggetNext = this.triggetNext.bind(this);
  }

  callMoviesBot() {

    const self = this;
    const { steps } = this.props;
    const search = steps.user.value;

    async function callAsync() {
      let training = `
      #Which library collections are included in this archive?
      MATCH(n:\`Library Collection\`)
      RETURN n.Title;
      
      #Who is interviewed most often in the archive?
      MATCH (n)-[r:interviewee]->()
      RETURN n, COUNT(r) AS numRels
      ORDER BY numRels DESC
      LIMIT 1
      
      #How many issues of The Real News are in this archive?
      MATCH (n:Collection_items)
      WHERE n.Title CONTAINS "The Real News"
      RETURN count(n)
      #`;



      let query = training + search + "\n"

      let textToSpeak = ''
      try {
        console.log("query", query)
        if (search) {

          const response = await openai.createCompletion("davinci", {
            prompt: query,
            temperature: 0,
            max_tokens: 150,
            top_p: 1.0,
            frequency_penalty: 0.0,
            presence_penalty: 0.0,
            stop: ["#", ";"],
          });

          console.log('response:', response);
          let cypher = response.data.choices[0].text;
          console.log('MoviesBot:' + cypher);

          try {
            const result = await session.run(cypher)

            //const singleRecord = result.records[0]

            const records = result.records

            records.forEach(element => {
              textToSpeak += element.get(0) + ", "
            });

            //textToSpeak = singleRecord.get(0)
            textToSpeak = textToSpeak.slice(0, -2)

            console.log("records", records)
          } finally {
            //await session.close()
          }

          // on application exit:
          //await driver.close()
        }
      }
      catch (error) {
        //console.log(process.env);
        console.error(error)
        console.log('MoviesBot:' + textToSpeak);
        textToSpeak = "Sorry I can't answer that. Could you please try again?"
      }

      let isConfidential = false;
      if (textToSpeak.startsWith(CONFIDENTIAL)) {
        isConfidential = true;
        // textToSpeak = textToSpeak.substring(CONFIDENTIAL.length)
      }

      self.setState({ loading: false, result: textToSpeak });

      if (isConfidential || textToSpeak.length > 115) {
        speech.speak({ text: "Please find the information below" })
          .then(() => { console.log("Success !") })
          .catch(e => { console.error("An error occurred :", e) })
      } else {
        speech.speak({ text: textToSpeak })
          .then(() => { console.log("Success !") })
          .catch(e => { console.error("An error occurred :", e) })
      }

    }
    callAsync();
  }

  triggetNext() {
    this.setState({}, () => {
      this.props.triggerNextStep();
    });
  }

  componentDidMount() {
    this.callMoviesBot();
    this.triggetNext();
  }

  render() {
    const { loading, result } = this.state;
    const lines = result.split("\n");
    const elements = [];
    for (const [index, value] of lines.entries()) {
      elements.push(<span key={index}>{value}<br /></span>)
    }

    return (
      <div className="bot-response">
        {loading ? <Loading /> : elements}
      </div>
    );
  }
}

MoviesBot.propTypes = {
  steps: PropTypes.object,
  triggerNextStep: PropTypes.func,
};

MoviesBot.defaultProps = {
  steps: undefined,
  triggerNextStep: undefined,
};

export default MoviesBot;
