package com.skydex.layout;

/**
 * A pushed layout was malformed. The message is sent straight back to the
 * website in the 400 body, so it must read as an explanation of what is wrong,
 * not as a stack-trace fragment.
 */
public class LayoutFormatException extends IllegalArgumentException {

    public LayoutFormatException(String reason) {
        super(reason);
    }
}
