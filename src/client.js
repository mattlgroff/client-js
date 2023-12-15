let fetch;
if (typeof globalThis.fetch === 'undefined') {
  fetch = (await import('node-fetch')).default;
} else {
  fetch = globalThis.fetch;
}

const RETRY_STATUS_CODES = [429, 500, 502, 503, 504];
const ENDPOINT = 'https://api.mistral.ai';

/**
 * MistralClient
 * @return {MistralClient}
 */
class MistralClient {
  /**
   * A simple and lightweight client for the Mistral API
   * @param {*} apiKey can be set as an environment variable MISTRAL_API_KEY,
   * or provided in this parameter
   * @param {*} endpoint defaults to https://api.mistral.ai
   */
  constructor(apiKey=process.env.MISTRAL_API_KEY, endpoint = ENDPOINT) {
    this.endpoint = endpoint;
    this.apiKey = apiKey;

    this.textDecoder = new TextDecoder();
  }

  /**
   *
   * @param {*} method
   * @param {*} path
   * @param {*} request
   * @return {Promise<*>}
   */
  _request = async function(method, path, request) {
    const url = `${this.endpoint}/${path}`;
    const options = {
      method: method,
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: method !== 'get' ? JSON.stringify(request) : null,
    };

    const maxRetries = 3;
    for (let attempts = 0; attempts < maxRetries; attempts++) {
      try {
        const response = await fetch(url, options);

        if (response.ok) {
          return await (request?.stream ? response : response.json());
        } else if (RETRY_STATUS_CODES.includes(response.status)) {
          console.debug(`Retrying request, attempt: ${attempts + 1}`);
          // eslint-disable-next-line max-len
          await new Promise((resolve) => setTimeout(resolve, (attempts + 1) * 500));
        } else {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
      } catch (error) {
        console.error(`Request failed: ${error.message}`);
        if (attempts === maxRetries - 1) throw error;
        // eslint-disable-next-line max-len
        await new Promise((resolve) => setTimeout(resolve, (attempts + 1) * 500));
      }
    }
    throw new Error('Max retries reached');
  };

  /**
   * Creates a chat completion request
   * @param {*} model
   * @param {*} messages
   * @param {*} temperature
   * @param {*} maxTokens
   * @param {*} topP
   * @param {*} randomSeed
   * @param {*} stream
   * @param {*} safeMode
   * @return {Promise<Object>}
   */
  _makeChatCompletionRequest = function(
    model,
    messages,
    temperature,
    maxTokens,
    topP,
    randomSeed,
    stream,
    safeMode,
  ) {
    return {
      model: model,
      messages: messages,
      temperature: temperature ?? undefined,
      max_tokens: maxTokens ?? undefined,
      top_p: topP ?? undefined,
      random_seed: randomSeed ?? undefined,
      stream: stream ?? undefined,
      safe_prompt: safeMode ?? undefined,
    };
  };


  /**
   * Returns a list of the available models
   * @return {Promise<Object>}
   */
  listModels = async function() {
    const response = await this._request('get', 'v1/models');
    return response;
  };

  /**
   * A chat endpoint without streaming
   * @param {*} model the name of the model to chat with, e.g. mistral-tiny
   * @param {*} messages an array of messages to chat with, e.g.
   * [{role: 'user', content: 'What is the best French cheese?'}]
   * @param {*} temperature the temperature to use for sampling, e.g. 0.5
   * @param {*} maxTokens the maximum number of tokens to generate, e.g. 100
   * @param {*} topP the cumulative probability of tokens to generate, e.g. 0.9
   * @param {*} randomSeed the random seed to use for sampling, e.g. 42
   * @param {*} safeMode whether to use safe mode, e.g. true
   * @return {Promise<Object>}
   */
  chat = async function({
    model,
    messages,
    temperature,
    maxTokens,
    topP,
    randomSeed,
    safeMode}) {
    const request = this._makeChatCompletionRequest(
      model,
      messages,
      temperature,
      maxTokens,
      topP,
      randomSeed,
      false,
      safeMode,
    );
    const response = await this._request(
      'post', 'v1/chat/completions', request,
    );
    return response;
  };

  /**
   * A chat endpoint that streams responses.
   * @param {*} model the name of the model to chat with, e.g. mistral-tiny
   * @param {*} messages an array of messages to chat with, e.g.
   * [{role: 'user', content: 'What is the best French cheese?'}]
   * @param {*} temperature the temperature to use for sampling, e.g. 0.5
   * @param {*} maxTokens the maximum number of tokens to generate, e.g. 100
   * @param {*} topP the cumulative probability of tokens to generate, e.g. 0.9
   * @param {*} randomSeed the random seed to use for sampling, e.g. 42
   * @param {*} safeMode whether to use safe mode, e.g. true
   * @return {Promise<Object>}
   */
  chatStream = async function* ({
    model,
    messages,
    temperature,
    maxTokens,
    topP,
    randomSeed,
    safeMode}) {
    const request = this._makeChatCompletionRequest(
      model,
      messages,
      temperature,
      maxTokens,
      topP,
      randomSeed,
      true,
      safeMode,
    );
    const response = await this._request(
      'post', 'v1/chat/completions', request,
    );

    for await (const chunk of response) {
      const chunkString = this.textDecoder.decode(chunk);
      // split the chunks by new line
      const chunkLines = chunkString.split('\n');
      // Iterate through the lines
      for (const chunkLine of chunkLines) {
        // If the line starts with data: then it is a chunk
        if (chunkLine.startsWith('data:')) {
          const chunkData = chunkLine.substring(6).trim();
          if (chunkData !== '[DONE]') {
            yield JSON.parse(chunkData);
          }
        }
      }
    }
  };

  /**
   * An embedddings endpoint that returns embeddings for a single,
   * or batch of inputs
   * @param {*} model The embedding model to use, e.g. mistral-embed
   * @param {*} input The input to embed,
   * e.g. ['What is the best French cheese?']
   * @return {Promise<Object>}
   */
  embeddings = async function({model, input}) {
    const request = {
      model: model,
      input: input,
    };
    const response = await this._request(
      'post', 'v1/embeddings', request,
    );
    return response;
  };
}


export default MistralClient;
