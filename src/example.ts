import { geocodeAddress } from './geocoder';
import { AddressNotFoundError, AmbiguousAddressError, GeocodingNetworkError } from './errors';

/**
 * Helper function to run a geocoding test and print diagnostic outputs.
 */
async function testGeocode(address: string, testLabel: string, threshold?: number) {
  console.log(`\n======================================================`);
  console.log(`🔍 [${testLabel}] Querying: "${address}"`);
  if (threshold !== undefined) {
    console.log(`   (Using custom score threshold: ${threshold})`);
  }
  console.log(`======================================================`);

  try {
    const result = await geocodeAddress(address, { scoreThreshold: threshold });
    
    console.log('✅ SUCCESS: High confidence match found!');
    console.log(`📍 Label:       ${result.properties.label}`);
    console.log(`🎯 Match Score: ${result.properties.score.toFixed(4)}`);
    console.log(`🌐 Coordinates: Longitude: ${result.geometry.coordinates[0]}, Latitude: ${result.geometry.coordinates[1]}`);
    console.log(`🏢 Details:     Type: ${result.properties.type}, Code Postal: ${result.properties.postcode}, INSEE: ${result.properties.citycode}`);
    
  } catch (error: unknown) {
    if (error instanceof AddressNotFoundError) {
      console.log('❌ ERROR: Address Not Found');
      console.log(`   Message: ${error.message}`);
      
    } else if (error instanceof AmbiguousAddressError) {
      console.log('⚠️  WARNING: Address is Ambiguous');
      console.log(`   Message: ${error.message}`);
      console.log('   Here are the suggestions received:');
      
      error.suggestions.forEach((suggestion, index) => {
        const score = suggestion.properties.score;
        const label = suggestion.properties.label;
        console.log(`   [${index + 1}] [Score: ${score.toFixed(4)}] ${label}`);
      });
      
    } else if (error instanceof GeocodingNetworkError) {
      console.log('❌ ERROR: Geocoding Network/API failure');
      console.log(`   Message: ${error.message}`);
      if (error.status) {
        console.log(`   HTTP Status: ${error.status} (${error.statusText})`);
      }
      if (error.originalError) {
        console.log(`   Details:`, error.originalError);
      }
      
    } else {
      console.log('❌ ERROR: Unexpected Error occurred');
      console.log(`   `, error);
    }
  }
}

/**
 * Main execution function running the sequence of tests.
 */
async function main() {
  console.log('🚀 Starting Geocoding Module Demonstration...');

  // Test Case 1: Exact complete address in France.
  // This should match with a score very close to 1.0 (>= 0.8) and succeed.
  await testGeocode('8 Boulevard du Port, 80000 Amiens', 'Exact Address - High Score');

  // Test Case 2: Ambiguous address query.
  // A generic street name without postal code or city should return multiple low score features,
  // triggering the AmbiguousAddressError and outputting suggestions.
  await testGeocode('Grande Rue', 'Ambiguous Query - Low Score');

  // Test Case 3: Empty/fake address query.
  // This should trigger the AddressNotFoundError.
  await testGeocode('FakeStreetNameThatDoesNotExistInFrance99999', 'Non-existent Query - No Results');

  // Test Case 4: Custom configuration testing.
  // Showing how scoreThreshold options can be customized by the caller.
  await testGeocode('Grande Rue, Paris', 'Ambiguous Paris Query with high threshold', 0.95);
  
  console.log('\n🏁 Demonstration sequence complete.');
}

main().catch((err) => {
  console.error('Fatal execution error:', err);
});
