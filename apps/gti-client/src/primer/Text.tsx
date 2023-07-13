import styled from "styled-components";
import {
  COMMON,
  SystemCommonProps,
  SystemTypographyProps,
  TYPOGRAPHY,
} from "./constants";
import sx, { SxProp } from "./sx";

type ComponentProps<T> = T extends React.ComponentType<
  React.PropsWithChildren<infer Props>
>
  ? Props extends object
    ? Props
    : never
  : never;

const Text = styled.span<SystemTypographyProps & SystemCommonProps & SxProp>`
  ${TYPOGRAPHY};
  ${COMMON};
  ${sx};
`;

export type TextProps = ComponentProps<typeof Text>;
export default Text;
