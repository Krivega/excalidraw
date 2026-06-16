type THeaders = {
  token?: string;
};

const getHeaders = ({ token }: THeaders) => {
  const headers = new Headers();

  headers.set("Content-Type", "application/json");

  if (token !== undefined) {
    headers.append("Authorization", `Bearer ${token}`);
  }

  return headers;
};

export default getHeaders;
