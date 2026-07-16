import { geocodeAddress, fetchParcelByLocation, fetchParcelById } from './geocoder';
import { BANFeature, ParcelCollectionDetails, BoundingBox } from './types';
import { AddressNotFoundError, AmbiguousAddressError, GeocodingNetworkError } from './errors';

// DOM Element Selections
const form = document.getElementById('geocode-form') as HTMLFormElement;
const addressInput = document.getElementById('address-input') as HTMLInputElement;
const thresholdInput = document.getElementById('threshold-input') as HTMLInputElement;
const thresholdVal = document.getElementById('threshold-val') as HTMLSpanElement;
const indexInput = document.getElementById('index-input') as HTMLSelectElement;
const postcodeInput = document.getElementById('postcode-input') as HTMLInputElement;
const citycodeInput = document.getElementById('citycode-input') as HTMLInputElement;

// State panels
const stateIdle = document.getElementById('state-idle') as HTMLElement;
const stateLoading = document.getElementById('state-loading') as HTMLElement;
const stateSuccess = document.getElementById('state-success') as HTMLElement;
const stateAmbiguous = document.getElementById('state-ambiguous') as HTMLElement;
const stateError = document.getElementById('state-error') as HTMLElement;

// Success state bindings
const resScore = document.getElementById('res-score') as HTMLSpanElement;
const resLabel = document.getElementById('res-label') as HTMLHeadingElement;
const resLat = document.getElementById('res-lat') as HTMLSpanElement;
const resLon = document.getElementById('res-lon') as HTMLSpanElement;
const resPostcode = document.getElementById('res-postcode') as HTMLSpanElement;
const resCitycode = document.getElementById('res-citycode') as HTMLSpanElement;
const resCity = document.getElementById('res-city') as HTMLSpanElement;
const resType = document.getElementById('res-type') as HTMLSpanElement;
const resContext = document.getElementById('res-context') as HTMLSpanElement;
const resId = document.getElementById('res-id') as HTMLSpanElement;
const copyCoordsBtn = document.getElementById('copy-coords-btn') as HTMLButtonElement;
const backToSuggestionsBtn = document.getElementById('back-to-suggestions-btn') as HTMLButtonElement;

// BBox and Area selectors
const resBboxContainer = document.getElementById('res-bbox-container') as HTMLDivElement;
const resBboxLat = document.getElementById('res-bbox-lat') as HTMLSpanElement;
const resBboxLon = document.getElementById('res-bbox-lon') as HTMLSpanElement;
const resAreaContainer = document.getElementById('res-area-container') as HTMLDivElement;
const resArea = document.getElementById('res-area') as HTMLSpanElement;

// WMS and tab selectors
// WMS and overlay selectors
const satelliteImg = document.getElementById('satellite-img') as HTMLImageElement;
const satelliteOverlayPlotsContainer = document.getElementById('satellite-overlay-plots-container') as any;

// Parcel reference selectors
const resParcelNameContainer = document.getElementById('res-parcel-name-container') as HTMLDivElement;
const resParcelName = document.getElementById('res-parcel-name') as HTMLSpanElement;

// Gemini Configuration selectors
const geminiKeyInput = document.getElementById('gemini-key') as HTMLInputElement;
const btnClearGeminiKey = document.getElementById('btn-clear-gemini-key') as HTMLButtonElement;

// AI Analysis Panel selectors
const btnRunAnalysis = document.getElementById('btn-run-analysis') as HTMLButtonElement;
const aiResultBox = document.getElementById('ai-result-box') as HTMLDivElement;
const aiLoading = document.getElementById('ai-loading') as HTMLDivElement;
const aiResults = document.getElementById('ai-results') as HTMLDivElement;
const badgePool = document.getElementById('badge-pool') as HTMLSpanElement;
const badgeSolar = document.getElementById('badge-solar') as HTMLSpanElement;
const textPoolDesc = document.getElementById('text-pool-desc') as HTMLDivElement;
const textSolarDesc = document.getElementById('text-solar-desc') as HTMLDivElement;
const textGeneralDesc = document.getElementById('text-general-desc') as HTMLDivElement;

// Ambiguity state bindings
const suggestionsList = document.getElementById('suggestions-list') as HTMLDivElement;

// Error state bindings
const errorTitle = document.getElementById('error-title') as HTMLHeadingElement;
const errorMsg = document.getElementById('error-msg') as HTMLParagraphElement;
const retryBtn = document.getElementById('retry-btn') as HTMLButtonElement;

// Keep track of current query and ambiguity options for back navigation
let lastSearchedAddress = '';
let currentSuggestions: BANFeature[] = [];
let currentParcelCollection: ParcelCollectionDetails | null = null;

/**
 * Updates the visibility of the different panels to show only the target state.
 */
function switchState(targetState: 'idle' | 'loading' | 'success' | 'ambiguous' | 'error') {
  const states = [
    { name: 'idle', element: stateIdle },
    { name: 'loading', element: stateLoading },
    { name: 'success', element: stateSuccess },
    { name: 'ambiguous', element: stateAmbiguous },
    { name: 'error', element: stateError },
  ];

  states.forEach((s) => {
    if (s.name === targetState) {
      s.element.classList.add('active');
    } else {
      s.element.classList.remove('active');
    }
  });
}

/**
 * Formats coordinates and updates the abstract SVG cadastral parcel boundaries dynamically.
 * Maps coordinates onto the SVG canvas.
 */
function renderParcelCanvas(targetLon: number, targetLat: number, parcelCollection?: ParcelCollectionDetails | null) {
  const canvasCoords = document.getElementById('canvas-coords');

  if (canvasCoords) {
    canvasCoords.textContent = `LAT: ${targetLat.toFixed(6)} | LON: ${targetLon.toFixed(6)}`;
  }

  // Clear previous vector paths
  satelliteOverlayPlotsContainer.innerHTML = '';

  const wrapper = document.querySelector('.satellite-wrapper') as HTMLDivElement;
  const svg = document.getElementById('satellite-overlay-svg') as any;

  if (!parcelCollection || !parcelCollection.parcels || parcelCollection.parcels.length === 0) {
    // If no parcels details, we place target marker exactly in the center of the viewport
    if (wrapper) {
      wrapper.style.aspectRatio = '1';
      wrapper.style.width = '100%';
      wrapper.style.height = 'auto';
    }
    if (svg) {
      svg.setAttribute('viewBox', '0 0 400 400');
    }
    updateMarkerPosition(200, 200);
    return;
  }

  // Compute boundaries using expanded bbox (with 5m margin)
  const bboxExact = parcelCollection.bbox;
  const bbox = expandBBoxByMeters(bboxExact, 5);
  const latRad = ((bbox.minLat + bbox.maxLat) / 2) * Math.PI / 180;
  const cosLat = Math.cos(latRad);
  const wDeg = (bbox.maxLon - bbox.minLon) * cosLat;
  const hDeg = bbox.maxLat - bbox.minLat;

  let width = 800;
  let height = 800;
  if (wDeg > 0 && hDeg > 0) {
    if (wDeg > hDeg) {
      height = Math.round(800 * (hDeg / wDeg));
    } else {
      width = Math.round(800 * (wDeg / hDeg));
    }
  }

  const viewBoxHeight = Math.round(400 * (height / width));

  // Adjust wrapper aspect ratio
  if (wrapper) {
    wrapper.style.aspectRatio = `${width} / ${height}`;
    wrapper.style.width = '100%';
    wrapper.style.height = 'auto';
  }

  // Set viewBox of SVG
  if (svg) {
    svg.setAttribute('viewBox', `0 0 400 ${viewBoxHeight}`);
  }

  // Render each parcel in the collection
  parcelCollection.parcels.forEach((parcel, index) => {
    const d = getSvgPathD(parcel.geometry, bbox, 400, viewBoxHeight);
    if (!d) return;

    const classNames = `parcel-path ${index === 0 ? 'primary' : 'context'}`;

    // Satellite Overlay Path
    const overlayPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    overlayPath.setAttribute('d', d);
    overlayPath.setAttribute('class', classNames);
    overlayPath.setAttribute('title', parcel.id);
    satelliteOverlayPlotsContainer.appendChild(overlayPath);
  });

  // Project target point (the geocoded point)
  const deltaLon = bbox.maxLon - bbox.minLon;
  const deltaLat = bbox.maxLat - bbox.minLat;
  const tx = deltaLon > 0 ? ((targetLon - bbox.minLon) / deltaLon) * 400 : 200;
  const ty = deltaLat > 0 ? viewBoxHeight - (((targetLat - bbox.minLat) / deltaLat) * viewBoxHeight) : viewBoxHeight / 2;

  updateMarkerPosition(tx, ty);
}

/**
 * Builds an SVG path data string d for Polygon and MultiPolygon geometries, supporting holes.
 */
function getSvgPathD(
  geometry: any,
  bbox: BoundingBox,
  viewBoxWidth: number,
  viewBoxHeight: number
): string {
  const project = ([lon, lat]: [number, number]): [number, number] => {
    const deltaLon = bbox.maxLon - bbox.minLon;
    const deltaLat = bbox.maxLat - bbox.minLat;
    const x = deltaLon > 0 ? ((lon - bbox.minLon) / deltaLon) * viewBoxWidth : 0;
    const y = deltaLat > 0 ? viewBoxHeight - (((lat - bbox.minLat) / deltaLat) * viewBoxHeight) : 0;
    return [x, y];
  };

  let polygons: [number, number][][][] = [];

  if (geometry.type === 'Polygon') {
    polygons = [geometry.coordinates];
  } else if (geometry.type === 'MultiPolygon') {
    polygons = geometry.coordinates;
  } else {
    return '';
  }

  // Generate SVG path sub-commands for all rings of all polygons
  return polygons.map(rings => {
    return rings.map(ring => {
      return ring.map((pt, i) => {
        const [x, y] = project(pt);
        return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
      }).join(' ') + ' Z';
    }).join(' ');
  }).join(' ');
}

function updateMarkerPosition(cx: number, cy: number) {
  // Update WMS satellite overlay marker
  const satelliteMarker = document.getElementById('satellite-overlay-marker');
  if (satelliteMarker) {
    const circles = satelliteMarker.querySelectorAll('circle');
    circles.forEach(c => {
      c.setAttribute('cx', cx.toString());
      c.setAttribute('cy', cy.toString());
    });

    const lines = satelliteMarker.querySelectorAll('line');
    if (lines.length === 2) {
      lines[0].setAttribute('x1', cx.toString());
      lines[0].setAttribute('y1', (cy - 35).toString());
      lines[0].setAttribute('x2', cx.toString());
      lines[0].setAttribute('y2', (cy + 35).toString());

      lines[1].setAttribute('x1', (cx - 35).toString());
      lines[1].setAttribute('y1', cy.toString());
      lines[1].setAttribute('x2', (cx + 35).toString());
      lines[1].setAttribute('y2', cy.toString());
    }
  }
}

/**
 * Formats and populates the details of a successful geocode match into the UI.
 */
function renderSuccess(feature: BANFeature, parcelCollection?: ParcelCollectionDetails | null) {
  currentParcelCollection = parcelCollection || null;
  const [lon, lat] = feature.geometry.coordinates;
  const props = feature.properties;

  // Toggle the back button depending on whether we navigated here from an ambiguity state
  if (currentSuggestions.length > 0) {
    backToSuggestionsBtn.style.display = 'inline-flex';
  } else {
    backToSuggestionsBtn.style.display = 'none';
  }

  resScore.textContent = props.score.toFixed(4);
  resLabel.textContent = props.label;
  resLat.textContent = lat.toFixed(6);
  resLon.textContent = lon.toFixed(6);

  resPostcode.textContent = props.postcode;
  resCitycode.textContent = props.citycode;
  resCity.textContent = props.city;
  resType.textContent = props.type;
  resContext.textContent = props.context;
  resId.textContent = props.id;

  // Render parcel details if available (bounding box, real surface, name)
  if (parcelCollection && parcelCollection.parcels.length > 0) {
    resBboxContainer.style.display = 'block';

    const b = parcelCollection.bbox;
    resBboxLat.textContent = `${b.minLat.toFixed(6)} / ${b.maxLat.toFixed(6)}`;
    resBboxLon.textContent = `${b.minLon.toFixed(6)} / ${b.maxLon.toFixed(6)}`;

    // Sum surface areas of all resolved parcels
    const totalSurface = parcelCollection.parcels.reduce((sum, p) => sum + p.surface, 0);
    resAreaContainer.style.display = 'flex';
    resArea.textContent = `${totalSurface} m²` + (parcelCollection.parcels.length > 1 ? ` (${parcelCollection.parcels.length} parc.)` : '');

    const primary = parcelCollection.parcels[0];
    if (primary.id) {
      resId.textContent = primary.id + (parcelCollection.parcels.length > 1 ? ` (+ ${parcelCollection.parcels.length - 1} autre(s))` : '');
    }

    // Reference parcel formatting (Section + Number)
    resParcelNameContainer.style.display = 'flex';
    const refText = primary.section ? `${primary.section} ${primary.number || ''}`.trim() : primary.id;
    resParcelName.textContent = refText + (parcelCollection.parcels.length > 1 ? ` (+ ${parcelCollection.parcels.length - 1} autre(s))` : '');
  } else {
    resBboxContainer.style.display = 'none';
    resAreaContainer.style.display = 'none';
    resParcelNameContainer.style.display = 'none';
  }

  // Render dynamic parcel visual (real polygon or mock)
  renderParcelCanvas(lon, lat, parcelCollection);

  // Load WMS satellite orthophoto using the expanded bounding box (with 5m margin) and dynamic width/height (or coordinate fallback)
  if (parcelCollection && parcelCollection.parcels.length > 0) {
    const bExact = parcelCollection.bbox;
    const b = expandBBoxByMeters(bExact, 5);
    const latRad = ((b.minLat + b.maxLat) / 2) * Math.PI / 180;
    const cosLat = Math.cos(latRad);
    const wDeg = (b.maxLon - b.minLon) * cosLat;
    const hDeg = b.maxLat - b.minLat;

    let width = 800;
    let height = 800;
    if (wDeg > 0 && hDeg > 0) {
      if (wDeg > hDeg) {
        height = Math.round(800 * (hDeg / wDeg));
      } else {
        width = Math.round(800 * (wDeg / hDeg));
      }
    }

    const wmsUrl = `https://data.geopf.fr/wms-r/wms?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetMap&LAYERS=ORTHOIMAGERY.ORTHOPHOTOS&STYLES=&FORMAT=image/jpeg&CRS=EPSG:4326&BBOX=${b.minLat},${b.minLon},${b.maxLat},${b.maxLon}&WIDTH=${width}&HEIGHT=${height}`;
    satelliteImg.src = wmsUrl;
  } else {
    // Fallback WMS centered around the geocoded address coordinates
    const delta = 0.001; // roughly 100-150m emprise
    const wmsUrl = `https://data.geopf.fr/wms-r/wms?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetMap&LAYERS=ORTHOIMAGERY.ORTHOPHOTOS&STYLES=&FORMAT=image/jpeg&CRS=EPSG:4326&BBOX=${lat - delta},${lon - delta},${lat + delta},${lon + delta}&WIDTH=800&HEIGHT=800`;
    satelliteImg.src = wmsUrl;
  }

  // Setup copy coordinates button behavior
  copyCoordsBtn.onclick = async () => {
    try {
      await navigator.clipboard.writeText(`${lat.toFixed(6)}, ${lon.toFixed(6)}`);
      const originalText = copyCoordsBtn.innerHTML;
      copyCoordsBtn.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="var(--color-success)" class="icon">
          <path stroke-linecap="round" stroke-linejoin="round" d="M4.5 12.75l6 6 9-13.5" />
        </svg>
        <span style="color: var(--color-success)">Copié !</span>
      `;
      setTimeout(() => {
        copyCoordsBtn.innerHTML = originalText;
      }, 2000);
    } catch (err) {
      console.error('Failed to copy coordinates: ', err);
    }
  };

  switchState('success');
}

/**
 * Formats and renders suggestions for the user when geocoding is ambiguous.
 */
function renderAmbiguity(suggestions: BANFeature[]) {
  currentSuggestions = suggestions;
  suggestionsList.innerHTML = '';

  suggestions.forEach((feature) => {
    const card = document.createElement('button');
    card.className = 'sug-card';
    card.type = 'button';

    const [lon, lat] = feature.geometry.coordinates;
    const score = feature.properties.score;
    const label = feature.properties.label;
    const type = feature.properties.type;

    card.innerHTML = `
      <div class="sug-main">
        <span class="sug-label">${label}</span>
        <span class="sug-sub">Type: ${type} • Lat: ${lat.toFixed(4)}, Lon: ${lon.toFixed(4)}</span>
      </div>
      <span class="sug-score">${score.toFixed(4)}</span>
    `;

    // Clicking a suggestion selects it and fetches its parcel details
    card.addEventListener('click', async () => {
      switchState('loading');
      let parcelCollection = null;
      try {
        const [sugLon, sugLat] = feature.geometry.coordinates;
        if (feature.properties.type === 'parcel') {
          parcelCollection = await fetchParcelById(feature.properties.id);
        } else {
          parcelCollection = await fetchParcelByLocation(sugLon, sugLat);
        }
      } catch (e) {
        console.warn("Could not retrieve parcel details for clicked suggestion:", e);
      }
      renderSuccess(feature, parcelCollection);
    });

    suggestionsList.appendChild(card);
  });

  switchState('ambiguous');
}

/**
 * Renders error details.
 */
function renderError(title: string, message: string) {
  errorTitle.textContent = title;
  errorMsg.textContent = message;
  switchState('error');
}

/**
 * Triggers the geocoding request and dispatches results to proper UI handlers.
 */
async function performGeocode(address: string) {
  if (!address.trim()) return;
  lastSearchedAddress = address;
  currentSuggestions = []; // Clear suggestions history for new searches
  backToSuggestionsBtn.style.display = 'none';
  if (aiResultBox) aiResultBox.style.display = 'none';
  switchState('loading');

  const threshold = parseFloat(thresholdInput.value);
  const index = indexInput.value as 'address' | 'poi' | 'parcel';
  const postcode = postcodeInput.value.trim() || undefined;
  const citycode = citycodeInput.value.trim() || undefined;

  try {
    const result = await geocodeAddress(address, {
      scoreThreshold: threshold,
      index: index,
      postcode: postcode,
      citycode: citycode,
    });

    // Successfully geocoded! Now attempt to fetch the real parcel details
    let parcelCollection = null;
    try {
      const [lon, lat] = result.geometry.coordinates;
      if (result.properties.type === 'parcel' || index === 'parcel') {
        parcelCollection = await fetchParcelById(result.properties.id);
      } else {
        parcelCollection = await fetchParcelByLocation(lon, lat);
      }
    } catch (cadastralError) {
      console.warn("Could not retrieve cadastral parcel boundaries: ", cadastralError);
    }

    renderSuccess(result, parcelCollection);

  } catch (error: unknown) {
    if (error instanceof AddressNotFoundError) {
      renderError(
        'Adresse introuvable',
        `Aucun résultat n'a été retourné par la Base Adresse Nationale pour la requête "${address}". Veuillez vérifier l'orthographe ou le code postal.`
      );
    } else if (error instanceof AmbiguousAddressError) {
      renderAmbiguity(error.suggestions);
    } else if (error instanceof GeocodingNetworkError) {
      let details = error.message;
      if (error.status) {
        details += ` (Status HTTP ${error.status})`;
      }
      renderError(
        'Erreur de communication',
        `Impossible d'interroger la Géoplateforme : ${details}. Veuillez vérifier votre connexion ou réessayez plus tard.`
      );
    } else {
      const msg = error instanceof Error ? error.message : String(error);
      renderError('Erreur inattendue', msg);
    }
  }
}

// Event Listeners
form.addEventListener('submit', (e) => {
  e.preventDefault();
  performGeocode(addressInput.value);
});

thresholdInput.addEventListener('input', () => {
  const val = parseFloat(thresholdInput.value);
  thresholdVal.textContent = val.toFixed(2);
});

retryBtn.addEventListener('click', () => {
  performGeocode(lastSearchedAddress);
});

backToSuggestionsBtn.addEventListener('click', () => {
  switchState('ambiguous');
});

// Load Gemini API Key on boot
const STORAGE_KEY = 'projet_geographique_gemini_key';
if (geminiKeyInput) {
  geminiKeyInput.value = localStorage.getItem(STORAGE_KEY) || '';
}

// Save Gemini API Key when input changes
if (geminiKeyInput) {
  geminiKeyInput.addEventListener('input', () => {
    localStorage.setItem(STORAGE_KEY, geminiKeyInput.value.trim());
  });
}

// Clear key button handler
if (btnClearGeminiKey) {
  btnClearGeminiKey.addEventListener('click', () => {
    if (confirm('Voulez-vous vraiment supprimer votre clé API Gemini de l\'application ?')) {
      if (geminiKeyInput) geminiKeyInput.value = '';
      localStorage.removeItem(STORAGE_KEY);
      alert('Clé API Gemini supprimée avec succès.');
    }
  });
}

/**
 * Expands a BoundingBox by a given margin in meters on all sides.
 */
function expandBBoxByMeters(bbox: BoundingBox, meters: number): BoundingBox {
  const centerLat = (bbox.minLat + bbox.maxLat) / 2;
  const latRad = centerLat * Math.PI / 180;

  // Degrees per meter
  const degPerMeterLat = 1 / 111111;
  const degPerMeterLon = 1 / (111111 * Math.cos(latRad));

  const marginLat = meters * degPerMeterLat;
  const marginLon = meters * degPerMeterLon;

  return {
    minLon: bbox.minLon - marginLon,
    maxLon: bbox.maxLon + marginLon,
    minLat: bbox.minLat - marginLat,
    maxLat: bbox.maxLat + marginLat
  };
}

/**
 * Downloads a JPEG image from a URL, overlays the parcel bounding box on a Canvas,
 * and converts it to a base64 string.
 */
async function fetchImageWithOverlayAsBase64(
  url: string,
  parcelCollection: ParcelCollectionDetails | null
): Promise<string> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Impossible de télécharger l'image satellite (Status HTTP ${response.status})`);
  }
  const blob = await response.blob();

  // If no parcel information, fall back to simple base64 image conversion
  if (!parcelCollection || !parcelCollection.parcels || parcelCollection.parcels.length === 0) {
    return new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const dataUrl = reader.result as string;
        const base64 = dataUrl.split(',')[1];
        resolve(base64);
      };
      reader.onerror = () => reject(new Error('Erreur de lecture du blob image en base64'));
      reader.readAsDataURL(blob);
    });
  }

  // Load blob into Image element for drawing on Canvas
  return new Promise<string>((resolve, reject) => {
    const img = new Image();
    const blobUrl = URL.createObjectURL(blob);

    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          throw new Error('Impossible de créer le contexte 2D du Canvas');
        }

        // Draw the background satellite image
        ctx.drawImage(img, 0, 0, img.width, img.height);

        const bboxExact = parcelCollection.bbox;
        const bbox = expandBBoxByMeters(bboxExact, 5);

        // Draw the exact parcel polygons inside the bounding box
        parcelCollection.parcels.forEach((parcel, index) => {
          ctx.beginPath();
          ctx.strokeStyle = index === 0 ? 'rgba(255, 69, 0, 0.8)' : 'rgba(128, 128, 128, 0.6)';
          ctx.lineWidth = index === 0 ? 4 : 2;
          ctx.lineJoin = 'round';

          const geometry = parcel.geometry;
          let polygons: [number, number][][][] = [];
          if (geometry.type === 'Polygon') {
            polygons = [geometry.coordinates];
          } else if (geometry.type === 'MultiPolygon') {
            polygons = geometry.coordinates;
          }

          polygons.forEach(rings => {
            rings.forEach(ring => {
              ring.forEach((pt, i) => {
                const px = ((pt[0] - bbox.minLon) / (bbox.maxLon - bbox.minLon)) * img.width;
                const py = img.height - (((pt[1] - bbox.minLat) / (bbox.maxLat - bbox.minLat)) * img.height);
                if (i === 0) {
                  ctx.moveTo(px, py);
                } else {
                  ctx.lineTo(px, py);
                }
              });
              ctx.closePath();
            });
          });
          ctx.stroke();
        });

        // Project bboxExact coordinates to draw the orange rectangle inside the padded image
        const deltaLon = bbox.maxLon - bbox.minLon;
        const deltaLat = bbox.maxLat - bbox.minLat;
        let x1 = 0;
        let x2 = img.width;
        let y1 = 0;
        let y2 = img.height;

        if (deltaLon > 0 && deltaLat > 0) {
          x1 = ((bboxExact.minLon - bbox.minLon) / deltaLon) * img.width;
          x2 = ((bboxExact.maxLon - bbox.minLon) / deltaLon) * img.width;
          y1 = img.height - (((bboxExact.maxLat - bbox.minLat) / deltaLat) * img.height);
          y2 = img.height - (((bboxExact.minLat - bbox.minLat) / deltaLat) * img.height);
        }

        const rectWidth = x2 - x1;
        const rectHeight = y2 - y1;

        // Draw the orange-red box border representing Option B: bounding box
        ctx.strokeStyle = '#FF4500';
        ctx.lineWidth = 6;
        ctx.strokeRect(x1, y1, rectWidth, rectHeight);

        // Add a subtle semi-transparent background fill inside the box
        ctx.fillStyle = 'rgba(255, 69, 0, 0.05)';
        ctx.fillRect(x1, y1, rectWidth, rectHeight);

        URL.revokeObjectURL(blobUrl);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
        resolve(dataUrl.split(',')[1]);
      } catch (err) {
        URL.revokeObjectURL(blobUrl);
        reject(err);
      }
    };

    img.onerror = () => {
      URL.revokeObjectURL(blobUrl);
      reject(new Error("Impossible de charger l'image satellite pour le Canvas"));
    };

    img.src = blobUrl;
  });
}


interface GeminiAnalysisResponse {
  hasPool: 'Oui' | 'Non' | 'Probable';
  poolConfidence: string;
  hasSolarPanels: 'Oui' | 'Non' | 'Probable';
  solarConfidence: string;
  generalAnalysis: string;
}

/**
 * Automatically lists models and returns a list of Flash and Pro models, sorted by version descending.
 */
async function selectBestModelsList(apiKey: string): Promise<string[]> {
  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
    if (!response.ok) {
      throw new Error(`Failed to fetch models list (Status ${response.status})`);
    }
    const data = await response.json();
    if (!data.models || !Array.isArray(data.models) || data.models.length === 0) {
      throw new Error('No models returned from API.');
    }

    // List of models supporting generateContent
    const validModels = data.models.filter((m: any) =>
      Array.isArray(m.supportedGenerationMethods) &&
      m.supportedGenerationMethods.includes('generateContent')
    );

    if (validModels.length === 0) {
      throw new Error('No models support generateContent.');
    }

    // Filter flash models and other models
    const flashModels = validModels.filter((m: any) => m.name.toLowerCase().includes('flash'));
    const otherModels = validModels.filter((m: any) => !m.name.toLowerCase().includes('flash'));

    // Sort helper: extracts version numbers (e.g. gemini-3.5-flash -> 3.5) and sorts descending
    const sortByVersion = (list: any[]) => {
      list.sort((a, b) => {
        const getVersion = (name: string): number => {
          const match = name.match(/gemini-(\d+(?:\.\d+)?)/i);
          return match ? parseFloat(match[1]) : 0;
        };
        return getVersion(b.name) - getVersion(a.name);
      });
    };

    sortByVersion(flashModels);
    sortByVersion(otherModels);

    // Prioritize Flash models, then fall back to reasoning Pro models
    const sortedCandidates = [...flashModels, ...otherModels];
    return sortedCandidates.map((m: any) => m.name);
  } catch (error) {
    console.warn('Auto-detecting models list failed, falling back to defaults', error);
    return [
      'models/gemini-1.5-flash-latest',
      'models/gemini-1.5-flash',
      'models/gemini-1.5-pro-latest'
    ];
  }
}

/**
 * Sends WMS image satellite data to Gemini API for pool and solar panel detection.
 * Integrates automatic model cycling and error fallbacks for overloads (503) or rate limits (429).
 */
async function runGeminiVisionAnalysis() {
  const apiKey = geminiKeyInput ? geminiKeyInput.value.trim() : '';
  if (!apiKey) {
    alert('Veuillez renseigner votre clé API Gemini dans le panneau de configuration à gauche avant de lancer l\'analyse.');
    return;
  }

  const imageUrl = satelliteImg.src;
  if (!imageUrl) {
    alert('Aucune image satellite chargée à analyser.');
    return;
  }

  // Show loading state
  aiResultBox.style.display = 'block';
  aiLoading.style.display = 'flex';
  aiResults.style.display = 'none';
  btnRunAnalysis.disabled = true;

  // Smoothly scroll the result box into the center of the viewport
  aiResultBox.scrollIntoView({ behavior: 'smooth', block: 'center' });

  try {
    const base64Image = await fetchImageWithOverlayAsBase64(imageUrl, currentParcelCollection);

    // Retrieve sorted list of available models on the user's API Key
    const modelsList = await selectBestModelsList(apiKey);
    console.log('[Gemini Vision] Candidates found:', modelsList);

    const prompt = `Tu es un expert en analyse d'images satellites. Analyse cette image satellite représentant une ou plusieurs parcelles cadastrales.
La parcelle principale à analyser (la cible) est délimitée par son contour précis tracé en orange/rouge sur l'image, elle-même entourée par un rectangle orange/rouge qui représente sa boîte englobante (bounding box). Les autres parcelles voisines sont tracées en gris fin.
Réponds strictement au format JSON demandé.
Détermine :
1. S'il y a une piscine (hors-sol, enterrée ou semi-enterrée) sur la parcelle principale ciblée en orange/rouge (Oui/Non/Probable).
2. S'il y a des panneaux solaires photovoltaïques ou thermiques (Oui/Non/Probable) sur les toitures ou au sol de cette même parcelle.
3. Fournis une explication concise de ce que tu observes pour chacun de ces éléments, ainsi qu'une description générale concise du terrain (bâtiment, végétation, environnement, estimation de la surface de la maison si c'est une maison).

Ne retourne rien d'autre que du JSON valide respectant le schéma demandé.`;

    let lastError: Error | null = null;
    let success = false;
    let resJson: any = null;
    let modelUsed = '';

    // Loop through model candidates in order of preference
    for (const modelName of modelsList) {
      console.log(`[Gemini Vision] Trying model: ${modelName}`);
      try {
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/${modelName}:generateContent?key=${apiKey}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            contents: [
              {
                parts: [
                  { text: prompt },
                  {
                    inlineData: {
                      mimeType: 'image/jpeg',
                      data: base64Image
                    }
                  }
                ]
              }
            ],
            generationConfig: {
              responseMimeType: 'application/json',
              responseSchema: {
                type: 'OBJECT',
                properties: {
                  hasPool: {
                    type: 'STRING',
                    description: "Présence d'une piscine: 'Oui', 'Non' ou 'Probable'"
                  },
                  poolConfidence: {
                    type: 'STRING',
                    description: "Description concise des éléments visuels détectés concernant la piscine (ex: 'Piscine enterrée rectangulaire visible au sud-est', 'Aucun plan d'eau détecté', etc.)"
                  },
                  hasSolarPanels: {
                    type: 'STRING',
                    description: "Présence de panneaux solaires: 'Oui', 'Non' ou 'Probable'"
                  },
                  solarConfidence: {
                    type: 'STRING',
                    description: "Description concise des éléments visuels détectés concernant les panneaux solaires"
                  },
                  generalAnalysis: {
                    type: 'STRING',
                    description: "Description générale succincte de la parcelle en français (ex: 'Zone pavillonnaire arborée avec une habitation principale de 150m² à toiture en ardoise')"
                  }
                },
                required: ['hasPool', 'poolConfidence', 'hasSolarPanels', 'solarConfidence', 'generalAnalysis']
              }
            }
          })
        });

        if (response.ok) {
          resJson = await response.json();
          modelUsed = modelName;
          success = true;
          break; // Successfully analyzed, break loop!
        } else {
          const errorText = await response.text();
          console.warn(`[Gemini Vision] Model ${modelName} failed (Status ${response.status}): ${errorText}`);
          lastError = new Error(`Gemini API error for ${modelName} (Status ${response.status}): ${errorText}`);
          // Continue to the next model in list
          continue;
        }
      } catch (err: any) {
        console.warn(`[Gemini Vision] Network failure for model ${modelName}:`, err);
        lastError = err;
        continue;
      }
    }

    if (!success) {
      throw lastError || new Error('Tous les modèles disponibles ont échoué à analyser l\'image.');
    }

    console.log(`[Gemini Vision] Successfully analyzed using model: ${modelUsed}`);

    const textResult = resJson.candidates[0].content.parts[0].text;
    const analysis: GeminiAnalysisResponse = JSON.parse(textResult);

    // Populate descriptive fields
    textPoolDesc.textContent = analysis.poolConfidence;
    textSolarDesc.textContent = analysis.solarConfidence;
    textGeneralDesc.textContent = analysis.generalAnalysis;

    // Format Pool Badge
    badgePool.className = 'badge';
    if (analysis.hasPool === 'Oui') {
      badgePool.textContent = 'Piscine : Détectée';
      badgePool.classList.add('detected');
    } else if (analysis.hasPool === 'Probable') {
      badgePool.textContent = 'Piscine : Probable';
      badgePool.classList.add('probable');
    } else {
      badgePool.textContent = 'Piscine : Non détectée';
      badgePool.classList.add('not-detected');
    }

    // Format Solar Badge
    badgeSolar.className = 'badge';
    if (analysis.hasSolarPanels === 'Oui') {
      badgeSolar.textContent = 'Panneaux : Détectés';
      badgeSolar.classList.add('detected');
    } else if (analysis.hasSolarPanels === 'Probable') {
      badgeSolar.textContent = 'Panneaux : Probables';
      badgeSolar.classList.add('probable');
    } else {
      badgeSolar.textContent = 'Panneaux : Non détectés';
      badgeSolar.classList.add('not-detected');
    }

    // Show results
    aiLoading.style.display = 'none';
    aiResults.style.display = 'flex';

    // Center the results perfectly after display
    setTimeout(() => {
      aiResultBox.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 100);

  } catch (error: any) {
    console.error('Gemini Vision Analysis failed:', error);

    // Check if error message indicates overload
    let userMsg = error.message || error;
    if (userMsg.includes('503') || userMsg.includes('high demand') || userMsg.includes('UNAVAILABLE')) {
      userMsg = "Les serveurs de Google Gemini sont actuellement surchargés (Erreur 503). Veuillez réesayer dans quelques instants.";
    }

    alert(`L'analyse de la parcelle par Gemini a échoué. Détails: ${userMsg}`);
    aiResultBox.style.display = 'none';
  } finally {
    btnRunAnalysis.disabled = false;
  }
}

// Bind run analysis button click
if (btnRunAnalysis) {
  btnRunAnalysis.addEventListener('click', runGeminiVisionAnalysis);
}
