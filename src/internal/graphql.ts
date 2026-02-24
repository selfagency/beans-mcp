/**
 * GraphQL queries and mutations for Beans CLI
 */

export const LIST_BEANS_QUERY = `
  query($filter: BeanFilter) {
    beans(filter: $filter) { id slug path title body status type priority tags parentId blockingIds blockedByIds createdAt updatedAt etag }
  }
`;

export const SHOW_BEAN_QUERY = `
  query($id: ID!) {
    bean(id: $id) { id slug path title body status type priority tags parentId blockingIds blockedByIds createdAt updatedAt etag }
  }
`;

export const CREATE_BEAN_MUTATION = `
  mutation($input: CreateBeanInput!) {
    createBean(input: $input) { id slug path title body status type priority tags parentId blockingIds blockedByIds createdAt updatedAt etag }
  }
`;

export const UPDATE_BEAN_MUTATION = `
  mutation($id: ID!, $input: UpdateBeanInput!) {
    updateBean(id: $id, input: $input) { id slug path title body status type priority tags parentId blockingIds blockedByIds createdAt updatedAt etag }
  }
`;

export const DELETE_BEAN_MUTATION = `
  mutation($id: ID!) {
    deleteBean(id: $id)
  }
`;
