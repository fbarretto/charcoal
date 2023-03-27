import prompts from 'prompts';
import { KilledError } from '../../lib/errors';

export async function getReviewers(
  reviewers: string | undefined
): Promise<string[]> {
  if (typeof reviewers === 'undefined') {
    return [];
  }

  if (reviewers === '') {
    const response = await prompts(
      {
        type: 'list',
        name: 'reviewers',
        message: 'Reviewers (comma-separated GitHub usernames)',
        separator: ',',
      },
      {
        onCancel: () => {
          throw new KilledError();
        },
      }
    );
    return response.reviewers;
  }

  return reviewers.split(',').map((reviewer) => reviewer.trim());
}
