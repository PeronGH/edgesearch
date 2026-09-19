const form = document.querySelector('form');
const input = document.querySelector('#query');
const status = document.querySelector('#status');
const results = document.querySelector('#results');
let active;

async function runSearch(query) {
  active?.abort();
  active = new AbortController();
  const { signal } = active;
  results.replaceChildren();
  status.textContent = 'Searching…';
  try {
    const response = await fetch(`/api/v1/search?${new URLSearchParams({ q: query })}`, { signal });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error ?? 'Search is unavailable. Please try again later.');
    for (const result of data.results) {
      const item = document.createElement('li');
      const heading = document.createElement('h2');
      const link = document.createElement('a');
      link.href = result.url;
      link.textContent = result.title;
      link.rel = 'noreferrer';
      heading.append(link);
      const url = document.createElement('div');
      url.className = 'url';
      url.textContent = result.url;
      item.append(heading, url);
      for (const snippet of result.snippets) {
        const paragraph = document.createElement('p');
        paragraph.textContent = snippet;
        item.append(paragraph);
      }
      const engines = document.createElement('small');
      engines.textContent = result.engines.join(' · ');
      item.append(engines);
      results.append(item);
    }
    status.textContent = data.results.length ? `${data.results.length} results` : 'No results found.';
    if (data.partial) status.textContent += ` Some engines failed: ${data.engine_errors.map(({ engine, error }) => `${engine} (${error})`).join(', ')}.`;
  } catch (error) {
    if (!signal.aborted) status.textContent = error.message;
  }
}

form.addEventListener('submit', (event) => {
  event.preventDefault();
  const query = input.value.trim();
  if (!query) return;
  history.pushState(null, '', `/?${new URLSearchParams({ q: query })}`);
  runSearch(query);
});

function restore() {
  input.value = new URLSearchParams(location.search).get('q') ?? '';
  if (input.value.trim()) runSearch(input.value.trim());
  else {
    active?.abort();
    results.replaceChildren();
    status.textContent = '';
  }
}
window.addEventListener('popstate', restore);
restore();
