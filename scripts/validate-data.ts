import { demoDatasetInput } from '../src/data/fixtures';
import { validateDataset } from '../src/data/schema';

try {
  const dataset = validateDataset(demoDatasetInput);
  const candidateCount = dataset.candidacies.length;
  const districtCount = dataset.districts.length;
  console.log(
    `Validated ${candidateCount} fictional candidacies across ${districtCount} fictional districts.`,
  );
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
