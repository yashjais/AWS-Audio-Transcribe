
import React, { Component } from 'react';
import MicrophoneStream from 'microphone-stream';
import {
  TranscribeStreamingClient,
  StartStreamTranscriptionCommand,
} from '@aws-sdk/client-transcribe-streaming';
import bufferFrom from 'buffer-from';

class App extends Component {
  constructor() {
    super();

    this.state = {
      isRecordingStopped: true,
    };
    this.micStream = React.createRef();
    this.speechToText = React.createRef();
    this.transcribeClient = React.createRef();
  }

  pcmEncodeChunk = (chunk) => {
    try {
      const input = MicrophoneStream.toRaw(chunk);
      let offset = 0;
      const buffer = new ArrayBuffer(input.length * 2);
      const view = new DataView(buffer);
      for (let i = 0; i < input.length; i++, offset += 2) {
        const s = Math.max(-1, Math.min(1, input[i]));
        view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
      }
      return bufferFrom(buffer);
    }
    catch (err) {
      console.log('in err of pcm encode chunk', err);
    }
  };

  awsTranscribe = async (event) => {
    console.log('event', event);
    try {
      const _this = this;
      const MAX_AUDIO_CHUNK_SIZE = 48000;
      const audioStream = async function* () {
        for await (const chunk of event) {
          if (chunk.length <= MAX_AUDIO_CHUNK_SIZE) {
            yield {
              AudioEvent: {
                AudioChunk: _this.pcmEncodeChunk(
                  chunk,
                ),
              },
            };
          }
        }
      };
      // Enter your credentials here
      const credentials = {
        accessKeyId: '',
        secretAccessKey: '',
        sessionToken: "",
      };

      const transcribeClient = new TranscribeStreamingClient({
        region: 'us-east-1',
        credentials,
      });
      this.transcribeClient = transcribeClient;

      const command = new StartStreamTranscriptionCommand({
        LanguageCode: 'en-US',
        MediaEncoding: 'pcm',
        MediaSampleRateHertz: 44100,
        AudioStream: audioStream(),
      });

      const data = await transcribeClient.send(command);
      let speechToText = '';
      for await (const evt of data.TranscriptResultStream) {
        for (const result of evt.TranscriptEvent.Transcript.Results || []) {
          if (result.IsPartial === false) {
            const noOfResults = result.Alternatives[0].Items.length;
            for (let i = 0; i < noOfResults; i++) {
              speechToText += `${result.Alternatives[0].Items[i].Content} `;
              this.speechToText.current = speechToText;
              console.log('speech to text', speechToText);
            }
          }
        }
      }
    }
    catch (err) {
      console.log('err', err);
    }
  };

  startRecording = async () => {
    this.setState({ isRecordingStopped: false });
    const audio = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: false,
    });

    let micStream = null;
    micStream = new MicrophoneStream();
    micStream.setStream(audio);
    this.micStream = micStream;
    this.awsTranscribe(micStream);
  };

  stopRecording = () => {
    // setTimeout(() => {
    //   console.log('destroying the client');
    this.setState({ isRecordingStopped: true });
    console.log('in the stop recording');
    this.transcribeClient?.destroy();
    this.micStream = null;
    // }, 3000);
  };

  render() {
    return (
      <div>
        <button onClick={this.startRecording}>Start recording</button>
        <button onClick={this.stopRecording}>Stop recording</button>
        <div>
          {!this.state.isRecordingStopped && <p>Recording in progress</p>}
        </div>
      </div>
    )
  }

}

export default App;
