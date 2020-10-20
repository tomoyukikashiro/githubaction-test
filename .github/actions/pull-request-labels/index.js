const github = require('@actions/github');
const core = require('@actions/core');

const uniq = array => [...new Set(array)];
const toLabelsArray = labelsKey => {
  const labelsStr = core.getInput(labelsKey);
  if (!labelsStr) throw new Error(`${labelsKey} is required.`);
  return labelsStr.split(',').map(label => label.trim());
}

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const eventData = github.context.payload;

const isApprovalFlow = eventData.action === 'submitted' && eventData.review.state === 'approved';
const isRequestChangeFlow = eventData.action === 'submitted' && eventData.review.state === 'changes_requested';
const [ owner, repo ] = eventData.repository.full_name.split('/');
const { number: pullNumber } = eventData.pull_request;
const octokit = github.getOctokit(GITHUB_TOKEN);

const replaceLabels = async (labels, toDelete, toAdd) => {
  const newLabels = labels
    .map(label => label.name)
    .filter(label => !toDelete.includes(label))
    .concat(toAdd);
  await octokit.issues.setLabels({
    owner,
    repo,
    issue_number: pullNumber,
    labels: newLabels
  })
}

const approvalFlow = async (reviews, labels) => {
  const labelsToDelete = toLabelsArray('approval_labels_to_delete');
  const labelsToAdd = toLabelsArray('approval_labels_to_add');
  const uniqueReviewerIds = uniq(reviews.map(review => review.user.id));
  const approvedReviews = uniqueReviewerIds
    .filter(userId => !!reviews.find(review => review.user.id === userId && review.state === 'APPROVED'));

  if (uniqueReviewerIds.length !== approvedReviews.length) {
    core.info('[FINISH] All reviewers have not approved yet.');
    return;
  }
  await replaceLabels(labels, labelsToDelete, labelsToAdd);
}

const requestChangeFlow = async (reviews, labels) => {
  const labelsToDelete = toLabelsArray('request_change_labels_to_delete');
  const labelsToAdd = toLabelsArray('request_change_labels_to_add');
  await replaceLabels(labels, labelsToDelete, labelsToAdd);
}

// main
(async () => {
  const { data: reviews } = await octokit.pulls.listReviews({
    owner,
    repo,
    pull_number: pullNumber,
  });
  const { data: labels } = await octokit.issues.listLabelsOnIssue({owner, repo, issue_number: pullNumber})
  try {
    if (isApprovalFlow) {
      core.info('[START] add label(s) for approval.');
      await approvalFlow(reviews, labels);
    } else if (isRequestChangeFlow) {
      core.info('[START] add labels(s) for request changes.');
      await requestChangeFlow(reviews, labels);
    } else {
      core.info('[SKIP] PR state have not changed for labeling.');
    }
  } catch (e) {
    core.setFailed(`[Error] ${e}`);
  }
})();
