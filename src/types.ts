/**
 * Type of geographical features returned by the BAN (Base Adresse Nationale) API.
 */
export type BANFeatureType = 'housenumber' | 'street' | 'position' | 'municipality' | 'townhall' | string;

/**
 * Properties returned inside each GeoJSON Feature by the BAN / IGN API.
 */
export interface BANProperties {
  /** Unique identifier of the resource */
  id: string;
  /** Complete formatted address label suitable for display */
  label: string;
  /** Confidence score between 0.0 and 1.0 */
  score: number;
  /** House number (if applicable) */
  housenumber?: string;
  /** Street name or place name */
  name: string;
  /** Postal code (5 digits) */
  postcode: string;
  /** INSEE city code (5 digits) */
  citycode: string;
  /** City name */
  city: string;
  /** Context hierarchy (e.g. department number, department name, region name) */
  context: string;
  /** Street name (if applicable) */
  street?: string;
  /** Type of the match */
  type: BANFeatureType;
  /** Importance score of the location */
  importance?: number;
  /** X coordinate in local projection (L93 for France main land) */
  x?: number;
  /** Y coordinate in local projection (L93 for France main land) */
  y?: number;
}

/**
 * GeoJSON Point geometry representation.
 */
export interface BANPointGeometry {
  type: 'Point';
  /** Longitude first, then Latitude: [lon, lat] */
  coordinates: [number, number];
}

/**
 * A single GeoJSON Feature representing a geocoded address.
 */
export interface BANFeature {
  type: 'Feature';
  geometry: BANPointGeometry;
  properties: BANProperties;
}

/**
 * GeoJSON FeatureCollection returned by the BAN API.
 */
export interface BANFeatureCollection {
  type: 'FeatureCollection';
  version?: string;
  features: BANFeature[];
  attribution?: string;
  licence?: string;
  query?: string;
  limit?: number;
}

/**
 * Configuration options for the geocoding request.
 */
export interface GeocodeOptions {
  /**
   * Confidence threshold to select the first result.
   * If the first match's score is less than this value, and there are multiple results,
   * the address is considered ambiguous.
   * Defaults to 0.8.
   */
  scoreThreshold?: number;

  /**
   * Maximum number of results to request from the API.
   * Defaults to 5.
   */
  limit?: number;

  /**
   * The index/dataset to search in.
   * - 'address': Base Adresse Nationale (addresses).
   * - 'poi': Points of interest / famous places.
   * - 'parcel': Cadastral parcels.
   * Defaults to 'address'.
   */
  index?: 'address' | 'poi' | 'parcel';

  /**
   * Optional filter to restrict search to a specific postcode.
   */
  postcode?: string;

  /**
   * Optional filter to restrict search to a specific INSEE city code.
   */
  citycode?: string;

  /**
   * Latitude for geographic bias (proximity search). Must be paired with `lon`.
   */
  lat?: number;

  /**
   * Longitude for geographic bias (proximity search). Must be paired with `lat`.
   */
  lon?: number;
}

/**
 * Representation of a geographical bounding box.
 */
export interface BoundingBox {
  minLon: number;
  minLat: number;
  maxLon: number;
  maxLat: number;
}

/**
 * Details of a cadastral parcel fetched from API Carto.
 */
export interface ParcelDetails {
  /** The 15-character unique parcel ID */
  id: string;
  /** Surface area in square meters */
  surface: number;
  /** GeoJSON geometry (Polygon or MultiPolygon) */
  geometry: any;
  /** Bounding box of the parcel boundaries */
  bbox: BoundingBox;
  /** Square expanded bounding box for projection alignment */
  squareBbox: BoundingBox;
  /** Department code */
  department?: string;
  /** Commune code insee */
  citycode?: string;
  /** Section code */
  section?: string;
  /** Parcel number */
  number?: string;
}

/**
 * Collection of cadastral parcels with combined boundaries.
 */
export interface ParcelCollectionDetails {
  /** Array of all resolved parcels */
  parcels: ParcelDetails[];
  /** Combined bounding box of all parcels */
  bbox: BoundingBox;
  /** Combined square expanded bounding box for uniform aspect ratio display */
  squareBbox: BoundingBox;
}
