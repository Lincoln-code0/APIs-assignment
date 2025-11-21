// The application is purely client-side and does not require a database connection.

let papersData = []; // Store the full, original fetched data
let currentFilters = new Set(); // Store active source filters
let currentSort = { key: 'relevance', order: 'desc' }; // Store current sort state

// DOM elements
const form = document.getElementById('search-form');
const queryInput = document.getElementById('search-query');
const resultsDiv = document.getElementById('paper-results');
const initialMessage = document.getElementById('initial-message');
const errorMessage = document.getElementById('error-message');
const noResultsMessage = document.getElementById('no-results-message');
const searchButton = document.getElementById('search-button');
const buttonText = document.getElementById('button-text');
const loadingSpinner = document.getElementById('loading-spinner');
const filterColumn = document.getElementById('filter-column');
const sourceFiltersDiv = document.getElementById('source-filters');
const sortSelect = document.getElementById('sort-select');

// --- Utility Functions for Data Handling ---

/**
 * Cleans up the raw text response from the LLM into a structured list of paper objects.
 * Note: This uses heuristic parsing as the LLM output is unstructured text.
 * @param {string} text The raw text output from the Gemini API.
 * @param {Array<Object>} sources The grounding attributions (sources).
 * @returns {Array<Object>} Structured array of paper objects.
 */
function parsePapersFromText(text, sources) {
    // Split the text by double newlines or similar separators to get individual paper blocks
    const blocks = text.split(/\n\s*\n/).filter(b => b.trim().length > 0);
    const paperList = [];

    blocks.forEach((block, index) => {
        const lines = block.trim().split('\n').filter(l => l.trim().length > 0);
        const title = lines[0] || `Paper ${index + 1}`;
        const abstract = lines.slice(1).join(' ').substring(0, 300) + '...'; // Truncate abstract
        
        // Mock metadata for fields not reliably returned by text generation
        const mockMetadata = {
            authors: 'AI Synthesis',
            year: new Date().getFullYear(),
            citation_count: Math.floor(Math.random() * 500) + 50 
        };

        // Link the paper to a grounding source for a "Source/Journal"
        // The modulo operator ensures we cycle through the available sources for all papers.
        const source = sources[index % sources.length] || { title: 'General Academic Source', uri: '#' };
        
        paperList.push({
            id: crypto.randomUUID(),
            title: title.replace(/^\*\*/, '').replace(/\*\*$/, '').trim(), // Clean up potential markdown
            abstract: abstract.trim(),
            authors: mockMetadata.authors,
            year: mockMetadata.year,
            citation_count: mockMetadata.citation_count,
            source_title: source.title,
            source_uri: source.uri,
            relevance: blocks.length - index, // Higher relevance for papers appearing earlier
        });
    });

    return paperList;
}

/**
 * Renders the current papers data based on active filters and sort order.
 * @param {Array<Object>} data The filtered and sorted array of paper objects.
 */
function renderPapers(data) {
    resultsDiv.innerHTML = ''; // Clear previous results

    if (data.length === 0) {
        noResultsMessage.classList.remove('hidden');
        return;
    } else {
        noResultsMessage.classList.add('hidden');
    }

    data.forEach(paper => {
        const cardHtml = `
            <div class="bg-white p-6 rounded-xl card mb-4 border-l-4 border-blue-500">
                <h2 class="text-xl font-bold text-gray-900 mb-2 hover:text-blue-600 transition duration-150">
                    <a href="${paper.source_uri}" target="_blank" rel="noopener noreferrer">${paper.title}</a>
                </h2>
                <div class="text-sm text-gray-500 mb-3 space-x-4">
                    <span><strong>Authors:</strong> ${paper.authors}</span>
                    <span><strong>Year:</strong> ${paper.year}</span>
                    <span><strong>Citations:</strong> <span class="text-green-600 font-semibold">${paper.citation_count}</span></span>
                </div>
                <p class="text-gray-700 mb-4 text-justify">${paper.abstract}</p>
                <div class="flex justify-between items-center text-xs">
                    <span class="bg-gray-200 text-gray-700 px-3 py-1 rounded-full font-medium">Source: ${paper.source_title}</span>
                    <a href="${paper.source_uri}" target="_blank" rel="noopener noreferrer" class="text-blue-500 hover:text-blue-700 font-medium">Read More &rarr;</a>
                </div>
            </div>
        `;
        resultsDiv.insertAdjacentHTML('beforeend', cardHtml);
    });
}

/**
 * Populates the filter sidebar with checkboxes based on unique sources.
 * @param {Array<Object>} data The full array of paper objects.
 */
function populateFilters(data) {
    const uniqueSources = [...new Set(data.map(p => p.source_title))].sort();
    sourceFiltersDiv.innerHTML = '';
    
    if (uniqueSources.length === 0) {
         sourceFiltersDiv.innerHTML = '<p class="text-sm text-gray-500">No external sources identified.</p>';
    } else {
        uniqueSources.forEach(source => {
            const isChecked = currentFilters.has(source);
            const count = data.filter(p => p.source_title === source).length;
            
            const filterHtml = `
                <label class="inline-flex items-center text-gray-700 cursor-pointer hover:bg-gray-100 p-1 rounded w-full">
                    <input type="checkbox" data-source="${source}" ${isChecked ? 'checked' : ''} 
                           class="form-checkbox h-4 w-4 text-blue-600 rounded" onchange="filterResults(event.target.dataset.source, this.checked)">
                    <span class="ml-2 text-sm">${source} (${count})</span>
                </label>
            `;
            sourceFiltersDiv.insertAdjacentHTML('beforeend', filterHtml);
        });
    }
    filterColumn.classList.remove('hidden');
    sortSelect.disabled = false;
}

/**
 * Filters and sorts the global papersData array.
 */
function applyFiltersAndSort() {
    let filteredData = papersData;

    // 1. Apply Filtering
    if (currentFilters.size > 0) {
        filteredData = papersData.filter(paper => currentFilters.has(paper.source_title));
    }

    // 2. Apply Sorting
    filteredData.sort((a, b) => {
        const key = currentSort.key;
        const order = currentSort.order === 'asc' ? 1 : -1;
        
        if (key === 'relevance') {
            // Relevance is defined by the original fetch order
            return order * (a.relevance - b.relevance);
        } else if (key === 'citation_count') {
            // Sort numerically by citation count
            return order * (a.citation_count - b.citation_count);
        }
        return 0;
    });

    renderPapers(filteredData);
}

// Expose global function for filter change event
window.filterResults = (source, isChecked) => {
    if (isChecked) {
        currentFilters.add(source);
    } else {
        currentFilters.delete(source);
    }
    applyFiltersAndSort();
};

// Event listener for sorting change
sortSelect.addEventListener('change', (e) => {
    const selectedOption = e.target.options[e.target.selectedIndex];
    currentSort.key = selectedOption.value;
    currentSort.order = selectedOption.dataset.order;
    applyFiltersAndSort();
});

// --- API Interaction Logic ---

const MAX_RETRIES = 3;
const BASE_DELAY = 1000;

/**
 * Fetches academic papers using the Gemini API with Google Search grounding.
 * Implements exponential backoff for retries.
 * @param {string} query The user's search query.
 * @returns {Promise<{text: string, sources: Array<Object>}>} The generated text and grounding sources.
 */
async function fetchAcademicPapers(query) {
    const systemPrompt = "You are an AI assistant designed to act as an Academic Paper Finder. Based on the user's query, find and synthesize the titles, authors, and a brief abstract for three highly relevant academic papers or research findings. Format your response as a single, readable string, clearly separating each entry with an empty line. Do not use Markdown formatting like lists or headers in the output text. Use mock values for citation counts and year if not found.";
    
    const userQuery = `Find academic papers, research articles, or recent scientific findings about: "${query}"`;
    const apiKey = ""; 
    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${apiKey}`;

    const payload = {
        contents: [{ parts: [{ text: userQuery }] }],
        tools: [{ "google_search": {} }],
        systemInstruction: {
            parts: [{ text: systemPrompt }]
        },
    };

    for (let i = 0; i < MAX_RETRIES; i++) {
        try {
            const response = await fetch(apiUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                throw new Error(`API returned status ${response.status}: ${response.statusText}`);
            }

            const result = await response.json();
            const candidate = result.candidates?.[0];

            if (candidate && candidate.content?.parts?.[0]?.text) {
                const text = candidate.content.parts[0].text;
                let sources = [];
                const groundingMetadata = candidate.groundingMetadata;
                
                if (groundingMetadata && groundingMetadata.groundingAttributions) {
                    sources = groundingMetadata.groundingAttributions
                        .map(attribution => ({
                            uri: attribution.web?.uri,
                            title: attribution.web?.title || 'Unknown Source',
                        }))
                        .filter(source => source.uri && source.title);
                }

                if (text.length < 50) { // Check for minimal content
                    throw new Error("Generated content was too brief or irrelevant.");
                }

                return { text, sources };
            } else {
                throw new Error("API response lacked candidate text.");
            }
        } catch (error) {
            // Do not log retry errors, only the final failure
            if (i === MAX_RETRIES - 1) {
                throw new Error(`Failed to fetch papers after ${MAX_RETRIES} attempts. Network or API issue: ${error.message}`);
            }
            // Exponential backoff
            const delay = BASE_DELAY * Math.pow(2, i);
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }
}


// --- Event Handlers ---
form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const query = queryInput.value.trim();
    if (!query) return;

    // Reset UI state
    initialMessage.classList.add('hidden');
    errorMessage.classList.add('hidden');
    noResultsMessage.classList.add('hidden');
    
    // Set Loading State
    buttonText.textContent = "Searching...";
    loadingSpinner.classList.remove('hidden');
    searchButton.disabled = true;
    resultsDiv.innerHTML = '<div class="text-center p-8 text-gray-500">Retrieving papers...</div>';
    
    // Clear previous filters/sort
    papersData = [];
    currentFilters.clear();
    
    try {
        const { text, sources } = await fetchAcademicPapers(query);
        
        // Parse and store data
        papersData = parsePapersFromText(text, sources);

        if (papersData.length === 0) {
            noResultsMessage.classList.remove('hidden');
            filterColumn.classList.add('hidden');
        } else {
            // Initial rendering, filtering, and sorting
            applyFiltersAndSort(); 
            populateFilters(papersData);
        }

    } catch (error) {
        console.error("Search failed:", error);
        // Clear any results and show error
        resultsDiv.innerHTML = ''; 
        errorMessage.textContent = `Error: ${error.message}`;
        errorMessage.classList.remove('hidden');
        filterColumn.classList.add('hidden');
        
    } finally {
        // Reset Button State
        buttonText.textContent = "Search Papers";
        loadingSpinner.classList.add('hidden');
        searchButton.disabled = false;
    }
});

// Initial setup for the sort selector
sortSelect.value = 'relevance';