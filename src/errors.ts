import { BANFeature } from './types';

/**
 * Base error class for all geocoding-related errors.
 */
export class GeocodingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GeocodingError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/**
 * Thrown when the geocoding service encounters a network problem
 * or when the remote API returns an HTTP error status code.
 */
export class GeocodingNetworkError extends GeocodingError {
  public readonly status?: number;
  public readonly statusText?: string;
  public readonly originalError?: unknown;

  constructor(message: string, status?: number, statusText?: string, originalError?: unknown) {
    super(message);
    this.name = 'GeocodingNetworkError';
    this.status = status;
    this.statusText = statusText;
    this.originalError = originalError;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/**
 * Thrown when no geographical feature is returned by the API for the given address.
 */
export class AddressNotFoundError extends GeocodingError {
  public readonly address: string;

  constructor(address: string) {
    super(`No geographical results found for address: "${address}"`);
    this.name = 'AddressNotFoundError';
    this.address = address;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/**
 * Thrown when the top match is below the confidence threshold,
 * meaning the address query is ambiguous.
 * Includes a list of suggestions for clarification.
 */
export class AmbiguousAddressError extends GeocodingError {
  public readonly address: string;
  public readonly topScore: number;
  public readonly suggestions: BANFeature[];

  constructor(address: string, topScore: number, suggestions: BANFeature[]) {
    super(
      `The address search for "${address}" is ambiguous. The highest match score was ${topScore.toFixed(2)}, which is below the threshold. ${suggestions.length} suggestions returned.`
    );
    this.name = 'AmbiguousAddressError';
    this.address = address;
    this.topScore = topScore;
    this.suggestions = suggestions;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
