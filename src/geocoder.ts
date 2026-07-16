import { BANFeature, BANFeatureCollection, BoundingBox, GeocodeOptions, ParcelDetails, ParcelCollectionDetails } from './types';
import { AddressNotFoundError, AmbiguousAddressError, GeocodingNetworkError } from './errors';

/**
 * Geocodes a textual address using the official IGN Géoplateforme Search API.
 * 
 * This function performs an asynchronous HTTP GET request to search the Base Adresse Nationale
 * database. It parses the resulting GeoJSON features, performs confidence score threshold validation,
 * and handles potential network or query errors.
 * 
 * @param address The plain text address to geocode (e.g. "8 boulevard du port, amiens").
 * @param options Query filters and scoring thresholds configuration.
 * @returns A promise that resolves to the highest scoring BANFeature.
 * 
 * @throws {AddressNotFoundError} If no results are found.
 * @throws {AmbiguousAddressError} If the highest score is below the threshold and suggestions exist.
 * @throws {GeocodingNetworkError} If network request fails, times out, or the API returns an error status.
 */
export async function geocodeAddress(
  address: string,
  options: GeocodeOptions = {}
): Promise<BANFeature> {
  if (!address || address.trim() === '') {
    throw new Error('Address query parameter cannot be empty.');
  }

  // Construct URL for the official IGN Géoplateforme Search endpoint
  const url = new URL('https://data.geopf.fr/geocodage/search');
  
  // Base parameters
  url.searchParams.append('q', address);
  url.searchParams.append('index', options.index || 'address');
  
  if (options.limit !== undefined) {
    url.searchParams.append('limit', options.limit.toString());
  } else {
    // Default limit to 5 results to have sufficient suggestion options if ambiguous
    url.searchParams.append('limit', '5');
  }

  // Filters
  if (options.postcode) {
    url.searchParams.append('postcode', options.postcode);
  }
  if (options.citycode) {
    url.searchParams.append('citycode', options.citycode);
  }

  // Geographic Proximity Bias (both must be present)
  if (options.lat !== undefined && options.lon !== undefined) {
    url.searchParams.append('lat', options.lat.toString());
    url.searchParams.append('lon', options.lon.toString());
  }

  // Set up an AbortController for a 10-second timeout request
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000);

  try {
    const response = await fetch(url.toString(), {
      signal: controller.signal,
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'ProjetGeographique/1.0.0 (Node.js Geocoding Module)'
      }
    });

    if (!response.ok) {
      throw new GeocodingNetworkError(
        `API responded with status ${response.status}: ${response.statusText}`,
        response.status,
        response.statusText
      );
    }

    let data: BANFeatureCollection;
    try {
      data = await response.json() as BANFeatureCollection;
    } catch (parseError) {
      throw new GeocodingNetworkError(
        'Failed to parse the API response as JSON',
        response.status,
        response.statusText,
        parseError
      );
    }

    // Verify response integrity
    if (!data || !Array.isArray(data.features) || data.features.length === 0) {
      throw new AddressNotFoundError(address);
    }

    const features = data.features;
    const firstFeature = features[0];
    const score = firstFeature.properties?.score;

    if (score === undefined) {
      throw new GeocodingNetworkError('API response feature did not contain a confidence score property.');
    }

    const threshold = options.scoreThreshold ?? 0.8;

    // Direct match check: high confidence match
    if (score >= threshold) {
      return firstFeature;
    }

    // Ambiguity check: if the confidence is low, we throw the suggestions
    throw new AmbiguousAddressError(address, score, features);

  } catch (error: unknown) {
    clearTimeout(timeoutId);

    // Re-throw our custom errors directly
    if (
      error instanceof AddressNotFoundError ||
      error instanceof AmbiguousAddressError ||
      error instanceof GeocodingNetworkError
    ) {
      throw error;
    }

    // Handle Fetch abort (timeout)
    if (error instanceof Error && error.name === 'AbortError') {
      throw new GeocodingNetworkError('Geocoding request timed out after 10000ms.');
    }

    // Handle generic system/network errors (e.g. ENOTFOUND DNS lookup failures)
    const errMessage = error instanceof Error ? error.message : String(error);
    throw new GeocodingNetworkError(`Network or request failure: ${errMessage}`, undefined, undefined, error);
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Fetches the cadastral parcel that intersects a specific geographic point [longitude, latitude].
 * Uses the official IGN API Carto Cadastre endpoint.
 * 
 * @param lon Longitude of the point.
 * @param lat Latitude of the point.
 * @returns Collection of parcels details including true geometry and combined bounding box.
 */
export async function fetchParcelByLocation(lon: number, lat: number): Promise<ParcelCollectionDetails> {
  const geomParam = JSON.stringify({
    type: 'Point',
    coordinates: [lon, lat]
  });

  const url = `https://apicarto.ign.fr/api/cadastre/parcelle?geom=${encodeURIComponent(geomParam)}`;
  
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'ProjetGeographique/1.0.0 (Node.js Geocoding Module)'
      }
    });

    if (!response.ok) {
      throw new GeocodingNetworkError(
        `API Carto responded with status ${response.status}: ${response.statusText}`,
        response.status,
        response.statusText
      );
    }

    const data = await response.json();
    if (!data || !Array.isArray(data.features) || data.features.length === 0) {
      throw new AddressNotFoundError(`No cadastral parcel found intersecting coordinates [${lon}, ${lat}]`);
    }

    const parcels: ParcelDetails[] = data.features.map((feature: any) => {
      const geom = feature.geometry;
      const props = feature.properties;
      const bbox = calculateBBox(geom);
      const squareBbox = expandBBoxToSquare(bbox);
      const computedId = props.code_cad || `${props.code_insee}${props.code_arr || '000'}${props.section}${props.numero.padStart(4, '0')}`;

      return {
        id: computedId,
        surface: props.contenance || 0,
        geometry: geom,
        bbox: bbox,
        squareBbox: squareBbox,
        department: props.code_dep,
        citycode: props.code_insee,
        section: props.section,
        number: props.numero
      };
    });

    const combinedBBox = combineBoundingBoxes(parcels.map(p => p.bbox));
    const combinedSquareBBox = expandBBoxToSquare(combinedBBox);

    return {
      parcels,
      bbox: combinedBBox,
      squareBbox: combinedSquareBBox
    };
  } catch (error) {
    clearTimeout(timeoutId);
    if (error instanceof Error && error.name === 'AbortError') {
      throw new GeocodingNetworkError('API Carto request timed out.');
    }
    if (error instanceof AddressNotFoundError || error instanceof GeocodingNetworkError) {
      throw error;
    }
    const msg = error instanceof Error ? error.message : String(error);
    throw new GeocodingNetworkError(`API Carto failure: ${msg}`, undefined, undefined, error);
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Fetches the cadastral parcel using its 15-character unique cadastral identifier.
 * 
 * @param parcelId 15-character parcel code (ex: "80021000DV0118")
 * @returns Collection of parcels details including true geometry and combined bounding box.
 */
export async function fetchParcelById(parcelId: string): Promise<ParcelCollectionDetails> {
  if (!parcelId || parcelId.trim().length !== 15) {
    throw new Error('Parcel ID must be exactly 15 characters.');
  }

  const url = `https://apicarto.ign.fr/api/cadastre/parcelle?code_cad=${parcelId}`;
  
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'ProjetGeographique/1.0.0 (Node.js Geocoding Module)'
      }
    });

    if (!response.ok) {
      throw new GeocodingNetworkError(
        `API Carto responded with status ${response.status}: ${response.statusText}`,
        response.status,
        response.statusText
      );
    }

    const data = await response.json();
    if (!data || !Array.isArray(data.features) || data.features.length === 0) {
      throw new AddressNotFoundError(`No cadastral parcel found for ID: ${parcelId}`);
    }

    const parcels: ParcelDetails[] = data.features.map((feature: any) => {
      const geom = feature.geometry;
      const props = feature.properties;
      const bbox = calculateBBox(geom);
      const squareBbox = expandBBoxToSquare(bbox);

      return {
        id: props.code_cad || parcelId,
        surface: props.contenance || 0,
        geometry: geom,
        bbox: bbox,
        squareBbox: squareBbox,
        department: props.code_dep,
        citycode: props.code_insee,
        section: props.section,
        number: props.numero
      };
    });

    const combinedBBox = combineBoundingBoxes(parcels.map(p => p.bbox));
    const combinedSquareBBox = expandBBoxToSquare(combinedBBox);

    return {
      parcels,
      bbox: combinedBBox,
      squareBbox: combinedSquareBBox
    };
  } catch (error) {
    clearTimeout(timeoutId);
    if (error instanceof Error && error.name === 'AbortError') {
      throw new GeocodingNetworkError('API Carto request timed out.');
    }
    if (error instanceof AddressNotFoundError || error instanceof GeocodingNetworkError) {
      throw error;
    }
    const msg = error instanceof Error ? error.message : String(error);
    throw new GeocodingNetworkError(`API Carto failure: ${msg}`, undefined, undefined, error);
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Combines multiple bounding boxes into a single bounding box enclosing all of them.
 * 
 * @param bboxes Array of bounding boxes
 * @returns Enclosing bounding box
 */
export function combineBoundingBoxes(bboxes: BoundingBox[]): BoundingBox {
  if (bboxes.length === 0) {
    return { minLon: 0, maxLon: 0, minLat: 0, maxLat: 0 };
  }

  let minLon = Infinity;
  let minLat = Infinity;
  let maxLon = -Infinity;
  let maxLat = -Infinity;

  for (const bbox of bboxes) {
    if (bbox.minLon < minLon) minLon = bbox.minLon;
    if (bbox.minLat < minLat) minLat = bbox.minLat;
    if (bbox.maxLon > maxLon) maxLon = bbox.maxLon;
    if (bbox.maxLat > maxLat) maxLat = bbox.maxLat;
  }

  return { minLon, minLat, maxLon, maxLat };
}

/**
 * Pads the shorter dimension of a bounding box so that it forms a perfect square.
 * This is crucial to avoid stretching in raster/WMS requests.
 * 
 * @param bbox Bounding box of the parcel
 * @returns A square-dimensioned BoundingBox centered on the original
 */
export function expandBBoxToSquare(bbox: BoundingBox): BoundingBox {
  const deltaLon = bbox.maxLon - bbox.minLon;
  const deltaLat = bbox.maxLat - bbox.minLat;
  const maxDelta = Math.max(deltaLon, deltaLat);

  const centerLon = (bbox.minLon + bbox.maxLon) / 2;
  const centerLat = (bbox.minLat + bbox.maxLat) / 2;

  // Add 15% margin around the parcel to prevent edges touching the screen
  const margin = maxDelta * 0.15;
  const paddedDelta = maxDelta + margin;

  return {
    minLon: centerLon - paddedDelta / 2,
    maxLon: centerLon + paddedDelta / 2,
    minLat: centerLat - paddedDelta / 2,
    maxLat: centerLat + paddedDelta / 2
  };
}

/**
 * Calculates the bounding box of a Polygon or MultiPolygon geometry.
 * 
 * @param geometry GeoJSON Polygon or MultiPolygon
 * @returns Bounding box bounding values [minLon, minLat, maxLon, maxLat]
 */
export function calculateBBox(geometry: any): BoundingBox {
  let coords: [number, number][] = [];

  if (geometry.type === 'Polygon') {
    coords = geometry.coordinates[0];
  } else if (geometry.type === 'MultiPolygon') {
    coords = geometry.coordinates.flatMap((poly: any) => poly[0]);
  } else if (geometry.type === 'Point') {
    coords = [geometry.coordinates];
  } else {
    throw new Error(`Unsupported geometry type for bounding box calculation: ${geometry.type}`);
  }

  let minLon = Infinity;
  let minLat = Infinity;
  let maxLon = -Infinity;
  let maxLat = -Infinity;

  for (const [lon, lat] of coords) {
    if (lon < minLon) minLon = lon;
    if (lat < minLat) minLat = lat;
    if (lon > maxLon) maxLon = lon;
    if (lat > maxLat) maxLat = lat;
  }

  return { minLon, minLat, maxLon, maxLat };
}
