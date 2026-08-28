const client = require('./client');

class LinkedInExtractor {
  async fetchProfileHtml(targetUrl) {
    return client.get(targetUrl);
  }

  getHeaders() {
    return client.getHeaders();
  }
}

module.exports = new LinkedInExtractor();
