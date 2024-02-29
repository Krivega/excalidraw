type THeaders = {
  token?: string;
};

const getHeaders = ({ token }: THeaders) => {
  const headers = new Headers();

  if (token !== undefined) {
    headers.append("Authorization", `Bearer ${token}`);
  }

  return headers;
};

export default getHeaders;
