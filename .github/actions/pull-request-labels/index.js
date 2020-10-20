const github = require('@actions/github');
const core = require('@actions/core');

const uniq = array => [...new Set(array)];

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const LABEL_TO_DELETE = core.getInput('label_to_delete')
const LABEL_TO_ADD = core.getInput('label_to_add')
const eventData = github.context.payload;

core.info(LABEL_TO_DELETE)
core.info(LABEL_TO_ADD)

if (eventData.action !== 'submitted' || eventData.review.state !== 'approved') {
  core.info('[Finish] PR have not been approved.');
  return;
}

const [ owner, repo ] = eventData.repository.full_name.split('/');
const { number: pullNumber } = eventData.pull_request;

(async () => {
  try {
    const octokit = github.getOctokit(GITHUB_TOKEN);

    const { data: reviews } = await octokit.pulls.listReviews({
      owner,
      repo,
      pull_number: pullNumber,
    });

    const uniqueReviewerIds = uniq(reviews.map(review => review.user.id));
    const approvedReviews = uniqueReviewerIds
      .filter(userId => !!reviews.find(review => review.user.id === userId && review.state === 'APPROVED'));

    if (uniqueReviewerIds.length !== approvedReviews.length) {
      core.info('[Finish] All reviewers have not approved yet.');
      return;
    }

    await octokit.issues.addLabels({
      owner,
      repo,
      issue_number: pullNumber,
      labels: [LABEL_TO_ADD]
    });

    core.info('add label')

    await octokit.issues.removeLabel({
      owner,
      repo,
      issue_number: pullNumber,
      name: LABEL_TO_DELETE
    });
    core.info('remove label')
    core.info('[Finish] All reviewers have just approved.');

  } catch (e) {
    core.setFailed(`[Error] ${e}`);
  }
})();
